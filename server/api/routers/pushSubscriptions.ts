import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { router, protectedProcedure } from '../router.js'
import { pushSubscriptions } from '../../db/schema.js'

export const pushSubscriptionsRouter = router({
  register: protectedProcedure
    .input(z.object({
      endpoint: z.string().url(),
      p256dh: z.string(),
      auth: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(pushSubscriptions)
        .values({
          userId: ctx.userId,
          endpoint: input.endpoint,
          subscription: { p256dh: input.p256dh, auth: input.auth },
        })
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          set: { lastUsedAt: sql`now()` },
        })
    }),
})
