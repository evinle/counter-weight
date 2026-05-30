import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { router, protectedProcedure } from '../router.js'
import { pushSubscriptions } from '../../db/schema.js'

function deriveDeviceHint(ua: string | null): string {
  if (!ua) return 'Unknown'
  if (/iPhone/.test(ua)) return 'Safari/iPhone'
  if (/iPad/.test(ua)) return 'Safari/iPad'
  if (/Android.*Chrome/.test(ua)) return 'Chrome/Android'
  if (/Android/.test(ua)) return 'Android'
  if (/Macintosh.*Chrome/.test(ua)) return 'Chrome/macOS'
  if (/Macintosh/.test(ua)) return 'Safari/macOS'
  if (/Windows.*Chrome/.test(ua)) return 'Chrome/Windows'
  if (/Windows.*Firefox/.test(ua)) return 'Firefox/Windows'
  if (/Linux.*Chrome/.test(ua)) return 'Chrome/Linux'
  return 'Unknown'
}

export const pushSubscriptionsRouter = router({
  register: protectedProcedure
    .input(z.object({
      endpoint: z.string().url(),
      p256dh: z.string(),
      auth: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const deviceHint = deriveDeviceHint(ctx.userAgent)
      await ctx.db
        .insert(pushSubscriptions)
        .values({
          userId: ctx.userId,
          endpoint: input.endpoint,
          subscription: { p256dh: input.p256dh, auth: input.auth, deviceHint },
        })
        .onConflictDoUpdate({
          target: [pushSubscriptions.endpoint, pushSubscriptions.userId],
          set: { lastUsedAt: sql`now()` },
        })
    }),
})
