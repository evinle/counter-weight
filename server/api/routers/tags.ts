import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../router.js'

export type InsertTagVals = {
  userId: string
  name: string
  color: string | null
  emoji: string | null
}

export type UpdateTagVals = {
  name: string
  color: string | null
  emoji: string | null
}

export type TagRecord = {
  id: string
  userId: string
  name: string
  color: string | null
  emoji: string | null
  version: number
  createdAt: Date
  updatedAt: Date
}

export type TagsDb = {
  insertTag(vals: InsertTagVals): Promise<{ serverId: string; version: number }>
  updateTag(
    where: { id: string; userId: string; version?: number },
    vals: UpdateTagVals,
  ): Promise<{ serverId: string; version: number } | null>
  deleteTag(where: { id: string; userId: string }): Promise<void>
  getTag(id: string, userId: string): Promise<TagRecord | null>
  reconcile(userId: string, since: Date | null): Promise<TagRecord[]>
}

export const tagUpsertInput = z.object({
  serverId: z.string().uuid().nullable(),
  name: z.string().min(1),
  color: z.string().nullable(),
  emoji: z.string().nullable(),
  version: z.number().int().optional(),
})

export const tagsRouter = router({
  upsert: protectedProcedure
    .input(tagUpsertInput)
    .mutation(async ({ ctx, input }) => {
      if (input.serverId) {
        const updated = await ctx.tagsDb.updateTag(
          { id: input.serverId, userId: ctx.userId, version: input.version },
          { name: input.name, color: input.color, emoji: input.emoji },
        )

        if (!updated)
          throw new TRPCError({ code: 'CONFLICT', message: 'Version mismatch or not found' })

        return updated
      }

      return ctx.tagsDb.insertTag({
        userId: ctx.userId,
        name: input.name,
        color: input.color,
        emoji: input.emoji,
      })
    }),

  delete: protectedProcedure
    .input(z.object({ serverId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.tagsDb.deleteTag({ id: input.serverId, userId: ctx.userId })
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
      const serverRecords = await ctx.tagsDb.reconcile(
        ctx.userId,
        input.since ? new Date(input.since) : null,
      )

      const serverNow = new Date().toISOString()

      const clientMap = new Map(
        input.records.map((r) => [r.serverId, new Date(r.updatedAt)]),
      )

      const tags = serverRecords.filter((sr) => {
        const clientUpdatedAt = clientMap.get(sr.id)
        return !clientUpdatedAt || sr.updatedAt > clientUpdatedAt
      })

      return { tags, serverNow }
    }),
})
