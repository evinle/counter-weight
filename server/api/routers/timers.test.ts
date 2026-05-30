import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'
import { timersRouter, timerUpsertInput } from './timers.js'
import { router, createCallerFactory } from '../router.js'
import { mockEnv } from '../../test/envHelpers.js'
import type { Db } from '../../db/index.js'
import type { z } from 'zod'

const testRouter = router({ timers: timersRouter })
const createCaller = createCallerFactory(testRouter)

type TimerUpsertInput = z.infer<typeof timerUpsertInput>

const BASE_INPUT = {
  serverId: null,
  title: 'Test timer',
  description: null,
  emoji: null,
  targetDatetime: '2026-06-01T12:00:00Z',
  originalTargetDatetime: '2026-06-01T12:00:00Z',
  status: 'active',
  priority: 'medium',
  isFlagged: false,
  recurrenceRule: null,
  version: undefined,
} satisfies TimerUpsertInput

// Drizzle's Db type is too complex for a partial to satisfy structurally — unavoidable cast
function makeCtx(userId: string | null, db: Partial<Db> = {}) {
  return { userId, db: db as unknown as Db, userAgent: null }
}

beforeEach(() => {
  mockEnv()
})

describe('timers.upsert', () => {
  it('throws UNAUTHORIZED when unauthenticated', async () => {
    const caller = createCaller(makeCtx(null))
    await expect(caller.timers.upsert(BASE_INPUT)).rejects.toThrow(TRPCError)
  })

  it('creates a new server timer when serverId is null', async () => {
    let callCount = 0
    const insert = vi.fn().mockImplementation(() => {
      const returning = callCount++ === 0
        ? vi.fn().mockResolvedValue([{ serverId: 'srv-uuid', version: 1 }])
        : vi.fn().mockResolvedValue([])
      const values = vi.fn().mockReturnValue({ returning })
      return { values }
    }) satisfies Partial<Db['insert']>

    const caller = createCaller(makeCtx('u1', { insert }))
    const result = await caller.timers.upsert(BASE_INPUT)

    expect(result.serverId).toBe('srv-uuid')
    expect(result.version).toBe(1)
    expect(insert).toHaveBeenCalledTimes(2) // timers + timer_events
  })

  it('throws CONFLICT when version does not match (atomic UPDATE returns zero rows)', async () => {
    const update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }) satisfies Partial<Db['update']>

    const caller = createCaller(makeCtx('u1', { update }))

    await expect(
      caller.timers.upsert({ ...BASE_INPUT, serverId: '00000000-0000-0000-0000-000000000001', version: 3 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
})

describe('timers.complete', () => {
  it('throws CONFLICT when version mismatches (atomic UPDATE returns zero rows)', async () => {
    const update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }) satisfies Partial<Db['update']>

    const caller = createCaller(makeCtx('u1', { update }))
    await expect(
      caller.timers.complete({ serverId: '00000000-0000-0000-0000-000000000002', version: 1 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
})

describe('timers.cancel', () => {
  it('throws CONFLICT when version mismatches (atomic UPDATE returns zero rows)', async () => {
    const update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }) satisfies Partial<Db['update']>

    const caller = createCaller(makeCtx('u1', { update }))
    await expect(
      caller.timers.cancel({ serverId: '00000000-0000-0000-0000-000000000003', version: 1 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
})
