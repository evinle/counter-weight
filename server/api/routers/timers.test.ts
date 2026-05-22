import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'
import { timersRouter } from './timers.js'
import { router, createCallerFactory } from '../router.js'
import { mockEnv } from '../../test/envHelpers.js'

const testRouter = router({ timers: timersRouter })
const createCaller = createCallerFactory(testRouter)

const BASE_INPUT = {
  serverId: null as string | null,
  title: 'Test timer',
  description: null,
  emoji: null,
  targetDatetime: '2026-06-01T12:00:00Z',
  originalTargetDatetime: '2026-06-01T12:00:00Z',
  status: 'active' as const,
  priority: 'medium' as const,
  isFlagged: false,
  recurrenceRule: null,
  version: undefined as number | undefined,
}

function mockInsertChain(returning: any[]) {
  const mockReturning = vi.fn().mockResolvedValue(returning)
  const mockValues = vi.fn().mockReturnValue({ returning: mockReturning })
  return { insert: vi.fn().mockReturnValue({ values: mockValues }) }
}

function mockSelectChain(rows: any[]) {
  const mockWhere = vi.fn().mockResolvedValue(rows)
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
  return { select: vi.fn().mockReturnValue({ from: mockFrom }) }
}

beforeEach(() => {
  mockEnv()
})

describe('timers.upsert', () => {
  it('throws UNAUTHORIZED when unauthenticated', async () => {
    const caller = createCaller({ userId: null, db: {} as any })
    await expect(caller.timers.upsert(BASE_INPUT)).rejects.toThrow(TRPCError)
  })

  it('creates a new server timer when serverId is null', async () => {
    let callCount = 0
    const insertMock = vi.fn().mockImplementation(() => {
      const returning = callCount++ === 0
        ? vi.fn().mockResolvedValue([{ serverId: 'srv-uuid', version: 1 }])
        : vi.fn().mockResolvedValue([])
      const values = vi.fn().mockReturnValue({ returning })
      return { values }
    })

    const caller = createCaller({ userId: 'u1', db: { insert: insertMock } as any })
    const result = await caller.timers.upsert(BASE_INPUT)

    expect(result.serverId).toBe('srv-uuid')
    expect(result.version).toBe(1)
    expect(insertMock).toHaveBeenCalledTimes(2) // timers + timer_events
  })

  it('throws CONFLICT when version does not match (atomic UPDATE returns zero rows)', async () => {
    const updateMock = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    })

    const caller = createCaller({
      userId: 'u1',
      db: { update: updateMock } as any,
    })

    await expect(
      caller.timers.upsert({ ...BASE_INPUT, serverId: '00000000-0000-0000-0000-000000000001', version: 3 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
})

describe('timers.complete', () => {
  it('throws CONFLICT when version mismatches (atomic UPDATE returns zero rows)', async () => {
    const updateMock = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    })

    const caller = createCaller({ userId: 'u1', db: { update: updateMock } as any })
    await expect(
      caller.timers.complete({ serverId: '00000000-0000-0000-0000-000000000002', version: 1 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
})
