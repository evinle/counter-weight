import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../router.js";
import { EventType, TimerStatus } from "../../db/schema.js";
import type { Priority, RecurrenceRule, TimerType } from "../../db/schema.js";
import { timerScheduleKeys } from "../scheduler.js";
import type { Scheduler } from "../scheduler.js";
import { nextOccurrence } from "@cw/recurrence";

export type WorkSessionJson = { startedAt: string; endedAt: string | null }

export type InsertTimerVals = {
  userId: string
  title: string
  description: string | null
  emoji: string | null
  targetDatetime: Date
  originalTargetDatetime: Date
  status: TimerStatus
  priority: Priority
  recurrenceRule: RecurrenceRule | null
  tagIds: string[]
  timerType: TimerType
  leadTimeMs: number | null
  workSessions: WorkSessionJson[]
}

export type UpdateTimerVals = {
  title: string
  description: string | null
  emoji: string | null
  targetDatetime: Date
  status: TimerStatus
  priority: Priority
  recurrenceRule: RecurrenceRule | null
  tagIds: string[]
  timerType: TimerType
  leadTimeMs: number | null
  workSessions: WorkSessionJson[]
}

export type TimerRecord = {
  id: string
  userId: string
  title: string
  description: string | null
  emoji: string | null
  targetDatetime: Date
  originalTargetDatetime: Date
  status: TimerStatus
  priority: Priority
  recurrenceRule: RecurrenceRule | null
  eventbridgeScheduleId: string | null
  version: number
  tagIds: string[]
  timerType: TimerType
  leadTimeMs: number | null
  workSessions: WorkSessionJson[]
  createdAt: Date
  updatedAt: Date
}

export type TimersDb = {
  listActive(userId: string): Promise<TimerRecord[]>;
  getTimer(id: string, userId: string): Promise<TimerRecord | null>;
  insertTimer(
    vals: InsertTimerVals,
  ): Promise<{ serverId: string; version: number; tagIds: string[] }>;
  updateTimer(
    where: { id: string; userId: string; version?: number },
    vals: UpdateTimerVals,
  ): Promise<{ serverId: string; version: number; tagIds: string[] } | null>;
  setStatus(
    where: { id: string; userId: string; version: number },
    status: typeof TimerStatus.Completed | typeof TimerStatus.Cancelled,
  ): Promise<{ id: string } | null>;
  insertTimerEvent(vals: {
    timerId: string;
    userId: string;
    eventType: EventType;
  }): Promise<void>;
  reconcile(userId: string, since: Date | null): Promise<TimerRecord[]>;
};

const workSessionJsonSchema = z.object({
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
})

export const timerUpsertInput = z.object({
  serverId: z.string().uuid().nullable(),
  title: z.string().min(1),
  description: z.string().nullable(),
  emoji: z.string().nullable(),
  targetDatetime: z.string().datetime(),
  originalTargetDatetime: z.string().datetime(),
  status: z.enum(['active', 'fired', 'completed', 'missed', 'cancelled']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  recurrenceRule: z.object({ cron: z.string(), tz: z.string() }).nullable(),
  version: z.number().int().optional(),
  tagIds: z.array(z.string().uuid()).default([]),
  timerType: z.enum(['reminder', 'task']),
  leadTimeMs: z.number().int().nonnegative().nullable(),
  workSessions: z.array(workSessionJsonSchema).default([]),
});

type SchedulingCtx = { userId: string; now: Date; scheduler: Scheduler }
type SpawnCtx = SchedulingCtx & { timersDb: TimersDb }

async function createTimerSchedules(
  serverId: string,
  targetDatetime: Date,
  leadTimeMs: number | null,
  ctx: SchedulingCtx,
): Promise<void> {
  const keys = timerScheduleKeys(serverId);
  await ctx.scheduler.createSchedule(keys.deadline, targetDatetime, {
    serverId,
    userId: ctx.userId,
    targetDatetime: targetDatetime.toISOString(),
    kind: 'deadline',
  });
  if (leadTimeMs !== null) {
    const leadDatetime = new Date(targetDatetime.getTime() - leadTimeMs);
    if (leadDatetime > ctx.now) {
      await ctx.scheduler.createSchedule(keys.lead, leadDatetime, {
        serverId,
        userId: ctx.userId,
        targetDatetime: leadDatetime.toISOString(),
        kind: 'lead',
      });
    }
  }
}

async function spawnNextOccurrence(
  timer: TimerRecord,
  rule: RecurrenceRule,
  completedTimerId: string,
  ctx: SpawnCtx,
): Promise<void> {
  const base = new Date(Math.max(ctx.now.getTime(), timer.targetDatetime.getTime()));
  const nextDatetime = nextOccurrence(rule.cron, rule.tz, base);

  const spawned = await ctx.timersDb.insertTimer({
    userId: ctx.userId,
    title: timer.title,
    description: timer.description,
    emoji: timer.emoji,
    targetDatetime: nextDatetime,
    originalTargetDatetime: nextDatetime,
    status: TimerStatus.Active,
    priority: timer.priority,
    recurrenceRule: rule,
    tagIds: timer.tagIds,
    timerType: timer.timerType,
    leadTimeMs: timer.leadTimeMs,
    workSessions: [],
  });

  await ctx.timersDb.insertTimerEvent({
    timerId: completedTimerId,
    userId: ctx.userId,
    eventType: EventType.Rescheduled,
  });

  await createTimerSchedules(spawned.serverId, nextDatetime, timer.leadTimeMs, ctx);
}

export const timersRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.timersDb.listActive(ctx.userId);
  }),

  get: protectedProcedure
    .input(z.object({ serverId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.timersDb.getTimer(input.serverId, ctx.userId);
    }),

  upsert: protectedProcedure
    .input(timerUpsertInput)
    .mutation(async ({ ctx, input }) => {
      if (input.serverId) {
        const updated = await ctx.timersDb.updateTimer(
          { id: input.serverId, userId: ctx.userId, version: input.version },
          {
            title: input.title,
            description: input.description,
            emoji: input.emoji,
            targetDatetime: new Date(input.targetDatetime),
            status: input.status,
            priority: input.priority,
            recurrenceRule: input.recurrenceRule,
            tagIds: input.tagIds,
            timerType: input.timerType,
            leadTimeMs: input.leadTimeMs,
            workSessions: input.workSessions,
          },
        );

        if (!updated)
          throw new TRPCError({
            code: "CONFLICT",
            message: "Version mismatch or not found",
          });

        const deadlineDatetime = new Date(input.targetDatetime);
        const keys = timerScheduleKeys(input.serverId);

        await ctx.scheduler.updateSchedule(keys.deadline, deadlineDatetime, {
          serverId: input.serverId,
          userId: ctx.userId,
          targetDatetime: input.targetDatetime,
          kind: 'deadline',
        });

        if (input.leadTimeMs !== null) {
          const leadDatetime = new Date(deadlineDatetime.getTime() - input.leadTimeMs);
          if (leadDatetime > ctx.now) {
            await ctx.scheduler.updateSchedule(keys.lead, leadDatetime, {
              serverId: input.serverId,
              userId: ctx.userId,
              targetDatetime: leadDatetime.toISOString(),
              kind: 'lead',
            });
          } else {
            await ctx.scheduler.deleteSchedule(keys.lead);
          }
        } else {
          await ctx.scheduler.deleteSchedule(keys.lead);
        }

        return updated;
      }

      const created = await ctx.timersDb.insertTimer({
        userId: ctx.userId,
        title: input.title,
        description: input.description,
        emoji: input.emoji,
        targetDatetime: new Date(input.targetDatetime),
        originalTargetDatetime: new Date(input.originalTargetDatetime),
        status: input.status,
        priority: input.priority,
        recurrenceRule: input.recurrenceRule,
        tagIds: input.tagIds,
        timerType: input.timerType,
        leadTimeMs: input.leadTimeMs,
        workSessions: input.workSessions,
      });

      await ctx.timersDb.insertTimerEvent({
        timerId: created.serverId,
        userId: ctx.userId,
        eventType: EventType.Created,
      });

      await createTimerSchedules(created.serverId, new Date(input.targetDatetime), input.leadTimeMs, ctx);

      return created;
    }),

  complete: protectedProcedure
    .input(z.object({ serverId: z.string().uuid(), version: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const timer = await ctx.timersDb.getTimer(input.serverId, ctx.userId);

      const updated = await ctx.timersDb.setStatus(
        { id: input.serverId, userId: ctx.userId, version: input.version },
        TimerStatus.Completed,
      );

      if (!updated) throw new TRPCError({ code: "CONFLICT" });

      await ctx.timersDb.insertTimerEvent({
        timerId: input.serverId,
        userId: ctx.userId,
        eventType: EventType.Completed,
      });

      const completeKeys = timerScheduleKeys(input.serverId);
      await ctx.scheduler.deleteSchedule(completeKeys.deadline);
      await ctx.scheduler.deleteSchedule(completeKeys.lead);

      if (timer?.recurrenceRule) {
        await spawnNextOccurrence(timer, timer.recurrenceRule, input.serverId, ctx);
      }

      return { ok: true };
    }),

  cancel: protectedProcedure
    .input(z.object({ serverId: z.string().uuid(), version: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.timersDb.setStatus(
        { id: input.serverId, userId: ctx.userId, version: input.version },
        TimerStatus.Cancelled,
      );

      if (!updated) throw new TRPCError({ code: "CONFLICT" });

      await ctx.timersDb.insertTimerEvent({
        timerId: input.serverId,
        userId: ctx.userId,
        eventType: EventType.Cancelled,
      });

      const cancelKeys = timerScheduleKeys(input.serverId);
      await ctx.scheduler.deleteSchedule(cancelKeys.deadline);
      await ctx.scheduler.deleteSchedule(cancelKeys.lead);

      return { ok: true };
    }),

  reconcile: protectedProcedure
    .input(
      z.object({
        since: z.string().datetime().nullable(),
        records: z.array(
          z.object({
            serverId: z.string().uuid(),
            updatedAt: z.string().datetime(),
          }),
        ),
      }),
    )
    .query(async ({ ctx, input }) => {
      const serverRecords = await ctx.timersDb.reconcile(
        ctx.userId,
        input.since ? new Date(input.since) : null,
      );

      const serverNow = new Date().toISOString();

      const clientMap = new Map(
        input.records.map((r) => [r.serverId, new Date(r.updatedAt)]),
      );

      const timers = serverRecords.filter((sr) => {
        const clientUpdatedAt = clientMap.get(sr.id);
        return !clientUpdatedAt || sr.updatedAt > clientUpdatedAt;
      });

      return { timers, serverNow };
    }),
});
