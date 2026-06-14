import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../router.js'

// Mirrors @cw/filters GroupConditions — kept in sync with packages/filters/src/schema.ts
const FieldConditionSchema = z.union([
  z.object({ field: z.literal('tags'), op: z.literal('contains'), value: z.string() }),
  z.object({ field: z.literal('priority'), op: z.literal('eq'), value: z.enum(['low', 'medium', 'high', 'critical']) }),
  z.object({ field: z.literal('priority'), op: z.literal('in'), value: z.array(z.enum(['low', 'medium', 'high', 'critical'])) }),
  z.object({ field: z.literal('status'), op: z.literal('eq'), value: z.enum(['active', 'fired', 'completed', 'missed', 'cancelled']) }),
  z.object({ field: z.literal('status'), op: z.literal('in'), value: z.array(z.enum(['active', 'fired', 'completed', 'missed', 'cancelled'])) }),
  z.object({ field: z.literal('targetDatetime'), op: z.literal('before'), value: z.string() }),
  z.object({ field: z.literal('targetDatetime'), op: z.literal('after'), value: z.string() }),
  z.object({ field: z.literal('targetDatetime'), op: z.literal('overdue') }),
  z.object({ field: z.literal('targetDatetime'), op: z.literal('today') }),
  z.object({ field: z.literal('targetDatetime'), op: z.literal('within_days'), value: z.number() }),
  z.object({ field: z.literal('title'), op: z.literal('contains'), value: z.string() }),
  z.object({ field: z.literal('recurrenceRule'), op: z.literal('exists') }),
  z.object({ field: z.literal('recurrenceRule'), op: z.literal('not_exists') }),
  z.object({ field: z.literal('emoji'), op: z.literal('eq'), value: z.string() }),
])

const GroupConditionsSchema = z.object({
  op: z.literal('AND'),
  conditions: z.array(FieldConditionSchema),
})

export type GroupConditions = z.infer<typeof GroupConditionsSchema>

export type InsertGroupVals = {
  userId: string
  name: string
  emoji: string | null
  color: string | null
  conditions: GroupConditions
}

export type UpdateGroupVals = {
  name: string
  emoji: string | null
  color: string | null
  conditions: GroupConditions
}

export type GroupRecord = {
  id: string
  userId: string
  name: string
  emoji: string | null
  color: string | null
  conditions: GroupConditions
  version: number
  createdAt: Date
  updatedAt: Date
}

export type GroupsDb = {
  insertGroup(vals: InsertGroupVals): Promise<{ serverId: string; version: number }>
  updateGroup(
    where: { id: string; userId: string; version?: number },
    vals: UpdateGroupVals,
  ): Promise<{ serverId: string; version: number } | null>
  deleteGroup(where: { id: string; userId: string }): Promise<void>
  reconcile(userId: string, since: Date | null): Promise<GroupRecord[]>
}

export const groupUpsertInput = z.object({
  serverId: z.string().uuid().nullable(),
  name: z.string().min(1),
  emoji: z.string().nullable(),
  color: z.string().nullable(),
  conditions: GroupConditionsSchema,
  version: z.number().int().optional(),
})

export const groupsRouter = router({
  upsert: protectedProcedure
    .input(groupUpsertInput)
    .mutation(async ({ ctx, input }) => {
      if (input.serverId) {
        const updated = await ctx.groupsDb.updateGroup(
          { id: input.serverId, userId: ctx.userId, version: input.version },
          { name: input.name, emoji: input.emoji, color: input.color, conditions: input.conditions },
        )

        if (!updated)
          throw new TRPCError({ code: 'CONFLICT', message: 'Version mismatch or not found' })

        return updated
      }

      return ctx.groupsDb.insertGroup({
        userId: ctx.userId,
        name: input.name,
        emoji: input.emoji,
        color: input.color,
        conditions: input.conditions,
      })
    }),

  delete: protectedProcedure
    .input(z.object({ serverId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.groupsDb.deleteGroup({ id: input.serverId, userId: ctx.userId })
      return { ok: true }
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
      const serverRecords = await ctx.groupsDb.reconcile(
        ctx.userId,
        input.since ? new Date(input.since) : null,
      )

      const serverNow = new Date().toISOString()

      const clientMap = new Map(
        input.records.map((r) => [r.serverId, new Date(r.updatedAt)]),
      )

      const groups = serverRecords.filter((sr) => {
        const clientUpdatedAt = clientMap.get(sr.id)
        return !clientUpdatedAt || sr.updatedAt > clientUpdatedAt
      })

      return { groups, serverNow }
    }),
})
