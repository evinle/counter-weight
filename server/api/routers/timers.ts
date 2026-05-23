import { z } from 'zod'
import { and, eq, gt, ne, sql } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../router.js'
import { timers, timerEvents } from '../../db/schema.js'

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
    return ctx.db
      .select()
      .from(timers)
      .where(and(eq(timers.userId, ctx.userId), ne(timers.status, 'cancelled')))
  }),

  get: protectedProcedure
    .input(z.object({ serverId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [timer] = await ctx.db
        .select()
        .from(timers)
        .where(and(eq(timers.id, input.serverId), eq(timers.userId, ctx.userId)))
      return timer ?? null
    }),

  upsert: protectedProcedure
    .input(timerUpsertInput)
    .mutation(async ({ ctx, input }) => {
      if (input.serverId) {
        const whereClause = input.version !== undefined
          ? and(
              eq(timers.id, input.serverId),
              eq(timers.userId, ctx.userId),
              eq(timers.version, input.version),
            )
          : and(eq(timers.id, input.serverId), eq(timers.userId, ctx.userId))

        const [updated] = await ctx.db
          .update(timers)
          .set({
            title: input.title,
            description: input.description,
            emoji: input.emoji,
            targetDatetime: new Date(input.targetDatetime),
            status: input.status,
            priority: input.priority,
            isFlagged: input.isFlagged,
            recurrenceRule: input.recurrenceRule,
            version: sql`${timers.version} + 1`,
            updatedAt: new Date(),
            // originalTargetDatetime intentionally omitted — immutable after creation
          })
          .where(whereClause)
          .returning({ serverId: timers.id, version: timers.version })

        if (!updated) throw new TRPCError({ code: 'CONFLICT', message: 'Version mismatch or not found' })
        return updated
      }

      const [created] = await ctx.db
        .insert(timers)
        .values({
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
        .returning({ serverId: timers.id, version: timers.version })

      await ctx.db.insert(timerEvents).values({
        timerId: created.serverId,
        userId: ctx.userId,
        eventType: 'created',
      })

      return created
    }),

  complete: protectedProcedure
    .input(z.object({ serverId: z.string().uuid(), version: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(timers)
        .set({ status: 'completed', version: sql`${timers.version} + 1`, updatedAt: new Date() })
        .where(and(
          eq(timers.id, input.serverId),
          eq(timers.userId, ctx.userId),
          eq(timers.version, input.version),
        ))
        .returning({ id: timers.id })

      if (!updated) throw new TRPCError({ code: 'CONFLICT' })

      await ctx.db.insert(timerEvents).values({
        timerId: input.serverId,
        userId: ctx.userId,
        eventType: 'completed',
      })

      return { ok: true }
    }),

  cancel: protectedProcedure
    .input(z.object({ serverId: z.string().uuid(), version: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(timers)
        .set({ status: 'cancelled', version: sql`${timers.version} + 1`, updatedAt: new Date() })
        .where(and(
          eq(timers.id, input.serverId),
          eq(timers.userId, ctx.userId),
          eq(timers.version, input.version),
        ))
        .returning({ id: timers.id })

      if (!updated) throw new TRPCError({ code: 'CONFLICT' })

      await ctx.db.insert(timerEvents).values({
        timerId: input.serverId,
        userId: ctx.userId,
        eventType: 'cancelled',
      })

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
      const conditions = [eq(timers.userId, ctx.userId)]
      if (input.since) conditions.push(gt(timers.updatedAt, new Date(input.since)))

      // Cancelled timers are intentionally included — clients need them to tombstone local copies
      const serverRecords = await ctx.db
        .select()
        .from(timers)
        .where(and(...conditions))

      const clientMap = new Map(
        input.records.map((r) => [r.serverId, new Date(r.updatedAt)]),
      )

      return serverRecords.filter((sr) => {
        const clientUpdatedAt = clientMap.get(sr.id)
        return !clientUpdatedAt || sr.updatedAt > clientUpdatedAt
      })
    }),
})
