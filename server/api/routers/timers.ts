import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../router.js'
import { EventType, TimerStatus } from '../../db/schema.js'
import type { Priority, RecurrenceRule } from '../../db/schema.js'

export type InsertTimerVals = {
  userId: string
  title: string
  description: string | null
  emoji: string | null
  targetDatetime: Date
  originalTargetDatetime: Date
  status: TimerStatus
  priority: Priority
  isFlagged: boolean
  recurrenceRule: RecurrenceRule | null
}

export type UpdateTimerVals = {
  title: string
  description: string | null
  emoji: string | null
  targetDatetime: Date
  status: TimerStatus
  priority: Priority
  isFlagged: boolean
  recurrenceRule: RecurrenceRule | null
}

export type TimerRecord = {
  id: string
  userId: string
  groupId: string | null
  title: string
  description: string | null
  emoji: string | null
  targetDatetime: Date
  originalTargetDatetime: Date
  status: TimerStatus
  priority: Priority
  isFlagged: boolean
  recurrenceRule: RecurrenceRule | null
  eventbridgeScheduleId: string | null
  version: number
  createdAt: Date
  updatedAt: Date
}

export type TimersDb = {
  listActive(userId: string): Promise<TimerRecord[]>
  getTimer(id: string, userId: string): Promise<TimerRecord | null>
  insertTimer(vals: InsertTimerVals): Promise<{ serverId: string; version: number }>
  updateTimer(
    where: { id: string; userId: string; version?: number },
    vals: UpdateTimerVals,
  ): Promise<{ serverId: string; version: number } | null>
  setStatus(
    where: { id: string; userId: string; version: number },
    status: typeof TimerStatus.Completed | typeof TimerStatus.Cancelled,
  ): Promise<{ id: string } | null>
  insertTimerEvent(vals: { timerId: string; userId: string; eventType: EventType }): Promise<void>
  reconcile(userId: string, since: Date | null): Promise<TimerRecord[]>
}

export const timerUpsertInput = z.object({
  serverId: z.string().uuid().nullable(),
  title: z.string().min(1),
  description: z.string().nullable(),
  emoji: z.string().nullable(),
  targetDatetime: z.string().datetime(),
  originalTargetDatetime: z.string().datetime(),
  status: z.enum(['active', 'fired', 'completed', 'missed', 'cancelled']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  isFlagged: z.boolean(),
  recurrenceRule: z.object({ cron: z.string(), tz: z.string() }).nullable(),
  version: z.number().int().optional(),
})

export const timersRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.timersDb.listActive(ctx.userId)
  }),

  get: protectedProcedure
    .input(z.object({ serverId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.timersDb.getTimer(input.serverId, ctx.userId)
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
            isFlagged: input.isFlagged,
            recurrenceRule: input.recurrenceRule,
          },
        )

        if (!updated) throw new TRPCError({ code: 'CONFLICT', message: 'Version mismatch or not found' })

        await ctx.scheduler.updateSchedule(
          `timer-${input.serverId}`,
          new Date(input.targetDatetime),
          { serverId: input.serverId, userId: ctx.userId, targetDatetime: input.targetDatetime },
        )

        return updated
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
        isFlagged: input.isFlagged,
        recurrenceRule: input.recurrenceRule,
      })

      await ctx.timersDb.insertTimerEvent({
        timerId: created.serverId,
        userId: ctx.userId,
        eventType: EventType.Created,
      })

      await ctx.scheduler.createSchedule(
        `timer-${created.serverId}`,
        new Date(input.targetDatetime),
        { serverId: created.serverId, userId: ctx.userId, targetDatetime: input.targetDatetime },
      )

      return created
    }),

  complete: protectedProcedure
    .input(z.object({ serverId: z.string().uuid(), version: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.timersDb.setStatus(
        { id: input.serverId, userId: ctx.userId, version: input.version },
        TimerStatus.Completed,
      )

      if (!updated) throw new TRPCError({ code: 'CONFLICT' })

      await ctx.timersDb.insertTimerEvent({
        timerId: input.serverId,
        userId: ctx.userId,
        eventType: EventType.Completed,
      })

      await ctx.scheduler.deleteSchedule(`timer-${input.serverId}`)

      return { ok: true }
    }),

  cancel: protectedProcedure
    .input(z.object({ serverId: z.string().uuid(), version: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.timersDb.setStatus(
        { id: input.serverId, userId: ctx.userId, version: input.version },
        TimerStatus.Cancelled,
      )

      if (!updated) throw new TRPCError({ code: 'CONFLICT' })

      await ctx.timersDb.insertTimerEvent({
        timerId: input.serverId,
        userId: ctx.userId,
        eventType: EventType.Cancelled,
      })

      await ctx.scheduler.deleteSchedule(`timer-${input.serverId}`)

      return { ok: true }
    }),

  reconcile: protectedProcedure
    .input(
      z.object({
        since: z.string().datetime().nullable(),
        records: z.array(
          z.object({ serverId: z.string().uuid(), updatedAt: z.string().datetime() }),
        ),
      }),
    )
    .query(async ({ ctx, input }) => {
      const serverRecords = await ctx.timersDb.reconcile(
        ctx.userId,
        input.since ? new Date(input.since) : null,
      )

      const clientMap = new Map(
        input.records.map((r) => [r.serverId, new Date(r.updatedAt)]),
      )

      const timers = serverRecords.filter((sr) => {
        const clientUpdatedAt = clientMap.get(sr.id)
        return !clientUpdatedAt || sr.updatedAt > clientUpdatedAt
      })

      return { timers, serverNow: new Date().toISOString() }
    }),
})
