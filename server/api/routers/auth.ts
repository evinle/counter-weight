import { z } from 'zod'
import { router, protectedProcedure } from '../router.js'
import { users } from '../../db/schema.js'

export const authRouter = router({
  bootstrap: protectedProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(users)
        .values({ id: ctx.userId, email: input.email })
        .onConflictDoUpdate({ target: users.id, set: { email: input.email } })
      return { ok: true }
    }),
})
