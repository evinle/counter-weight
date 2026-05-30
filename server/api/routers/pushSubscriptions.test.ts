import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'
import { pushSubscriptionsRouter } from './pushSubscriptions.js'
import { router, createCallerFactory } from '../router.js'
import { mockEnv } from '../../test/envHelpers.js'
import type { Db } from '../../db/index.js'

const testRouter = router({ pushSubscriptions: pushSubscriptionsRouter })
const createCaller = createCallerFactory(testRouter)

const BASE_INPUT = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
  p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtbTTSZl',
  auth: 'tBHItJI5svbpez7KI4CCXg',
} as const

function makeCtx(userId: string | null, db: Partial<Db> = {}, userAgent: string | null = null) {
  return { userId, db: db as unknown as Db, userAgent }
}

beforeEach(() => {
  mockEnv()
})

describe('pushSubscriptions.register', () => {
  it('throws UNAUTHORIZED when unauthenticated', async () => {
    const caller = createCaller(makeCtx(null))
    await expect(caller.pushSubscriptions.register(BASE_INPUT)).rejects.toThrow(TRPCError)
  })

  it('upserts a new push subscription row for a new endpoint', async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue([])
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate })
    const insert = vi.fn().mockReturnValue({ values }) satisfies Partial<Db['insert']>

    const caller = createCaller(makeCtx('u1', { insert }))
    await caller.pushSubscriptions.register(BASE_INPUT)

    expect(insert).toHaveBeenCalledOnce()
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        endpoint: BASE_INPUT.endpoint,
      }),
    )
    expect(onConflictDoUpdate).toHaveBeenCalledOnce()
  })

  it('updates last_used_at on conflict (same endpoint, same user)', async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue([])
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate })
    const insert = vi.fn().mockReturnValue({ values }) satisfies Partial<Db['insert']>

    const caller = createCaller(makeCtx('u1', { insert }))
    await caller.pushSubscriptions.register(BASE_INPUT)
    await caller.pushSubscriptions.register(BASE_INPUT)

    expect(insert).toHaveBeenCalledTimes(2)
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(2)
  })

  it('different users registering the same endpoint each get their own row', async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue([])
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate })
    const insert = vi.fn().mockReturnValue({ values }) satisfies Partial<Db['insert']>

    const callerU1 = createCaller(makeCtx('u1', { insert }))
    const callerU2 = createCaller(makeCtx('u2', { insert }))

    await callerU1.pushSubscriptions.register(BASE_INPUT)
    await callerU2.pushSubscriptions.register(BASE_INPUT)

    // Each user inserts with their own userId — no conflict since the unique key is (endpoint, userId)
    expect(insert).toHaveBeenCalledTimes(2)
    expect(values).toHaveBeenNthCalledWith(1, expect.objectContaining({ userId: 'u1' }))
    expect(values).toHaveBeenNthCalledWith(2, expect.objectContaining({ userId: 'u2' }))
  })
})
