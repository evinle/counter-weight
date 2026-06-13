import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'
import { authRouter } from './auth.js'
import { router, createCallerFactory } from '../router.js'
import { mockEnv } from '../../test/envHelpers.js'
import { createFakeTimersDb } from '../../test/fakes/timersDb.js'
import { createFakeScheduler } from '../../test/fakes/scheduler.js'
import { createFakeTagsDb } from '../../test/fakes/tagsDb.js'
import type { Db } from '../../db/index.js'

const testRouter = router({ auth: authRouter })
const createCaller = createCallerFactory(testRouter)

function makeCtx(userId: string | null) {
  const onConflictDoUpdate = vi.fn().mockResolvedValue([])
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate })
  const insert = vi.fn().mockReturnValue({ values })
  const db = { insert } satisfies Pick<Db, 'insert'>
  return { userId, db: db as unknown as Db, timersDb: createFakeTimersDb(), tagsDb: createFakeTagsDb(), scheduler: createFakeScheduler(), userAgent: null }
}

beforeEach(() => {
  mockEnv()
})

describe('auth.bootstrap', () => {
  it('throws UNAUTHORIZED when not authenticated', async () => {
    const caller = createCaller(makeCtx(null))
    await expect(
      caller.auth.bootstrap({ email: 'user@example.com' }),
    ).rejects.toThrow(TRPCError)
  })

  it('upserts the user row when authenticated', async () => {
    const ctx = makeCtx('user-sub-123')
    const caller = createCaller(ctx)
    const result = await caller.auth.bootstrap({ email: 'user@example.com' })
    expect(result).toEqual({ ok: true })
    expect(ctx.db.insert).toHaveBeenCalled()
  })
})
