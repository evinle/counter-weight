import { describe, it, expect, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'
import { timersRouter, timerUpsertInput } from './timers.js'
import { router, createCallerFactory } from '../router.js'
import { mockEnv } from '../../test/envHelpers.js'
import { createFakeTimersDb } from '../../test/fakes/timersDb.js'
import { createFakeScheduler } from '../../test/fakes/scheduler.js'
import type { FakeTimersDb } from '../../test/fakes/timersDb.js'
import type { FakeScheduler } from '../../test/fakes/scheduler.js'
import type { TimerRecord } from './timers.js'
import type { Db } from '../../db/index.js'
import type { Scheduler } from '../scheduler.js'
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

const EXISTING_TIMER = {
  id: '00000000-0000-0000-0000-000000000001',
  userId: 'u1',
  groupId: null,
  title: 'Existing timer',
  description: null,
  emoji: null,
  targetDatetime: new Date('2026-06-01T12:00:00Z'),
  originalTargetDatetime: new Date('2026-06-01T12:00:00Z'),
  status: 'active',
  priority: 'medium',
  isFlagged: false,
  recurrenceRule: null,
  eventbridgeScheduleId: null,
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies TimerRecord

function makeCtx(userId: string | null, timersDb: FakeTimersDb, scheduler: Scheduler) {
  return { userId, db: {} as unknown as Db, timersDb, scheduler, userAgent: null }
}

let fakeDb: FakeTimersDb
let fakeScheduler: FakeScheduler

beforeEach(() => {
  mockEnv()
  fakeDb = createFakeTimersDb()
  fakeScheduler = createFakeScheduler()
})

describe('timers.upsert', () => {
  it('throws UNAUTHORIZED when unauthenticated', async () => {
    const caller = createCaller(makeCtx(null, fakeDb, fakeScheduler))
    await expect(caller.timers.upsert(BASE_INPUT)).rejects.toThrow(TRPCError)
  })

  it('inserts a new timer and creates a schedule', async () => {
    // Arrange
    const caller = createCaller(makeCtx('u1', fakeDb, fakeScheduler))

    // Act
    const result = await caller.timers.upsert(BASE_INPUT)

    // Assert — timer persisted
    expect(fakeDb.timers).toHaveLength(1)
    expect(fakeDb.timers[0]).toMatchObject({ userId: 'u1', title: 'Test timer', status: 'active' })
    expect(result.serverId).toBe(fakeDb.timers[0].id)

    // Assert — created event written
    expect(fakeDb.timerEvents).toHaveLength(1)
    expect(fakeDb.timerEvents[0]).toMatchObject({ timerId: result.serverId, eventType: 'created' })

    // Assert — schedule created with correct target and payload
    const schedule = fakeScheduler.schedules.get(`timer-${result.serverId}`)
    expect(schedule).toMatchObject({
      targetDatetime: new Date('2026-06-01T12:00:00Z'),
      payload: { serverId: result.serverId, userId: 'u1', targetDatetime: '2026-06-01T12:00:00Z' },
    })
  })

  it('throws CONFLICT when version does not match', async () => {
    // Arrange
    fakeDb = createFakeTimersDb({ timers: [EXISTING_TIMER] })
    const caller = createCaller(makeCtx('u1', fakeDb, fakeScheduler))

    // Act / Assert
    await expect(
      caller.timers.upsert({ ...BASE_INPUT, serverId: EXISTING_TIMER.id, version: 99 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('updates an existing timer and reschedules', async () => {
    // Arrange
    fakeDb = createFakeTimersDb({ timers: [EXISTING_TIMER] })
    const caller = createCaller(makeCtx('u1', fakeDb, fakeScheduler))

    // Act
    await caller.timers.upsert({
      ...BASE_INPUT,
      serverId: EXISTING_TIMER.id,
      version: 1,
      targetDatetime: '2026-07-01T09:00:00Z',
    })

    // Assert — version bumped
    expect(fakeDb.timers[0].version).toBe(2)

    // Assert — schedule updated to new target
    const schedule = fakeScheduler.schedules.get(`timer-${EXISTING_TIMER.id}`)
    expect(schedule).toMatchObject({
      targetDatetime: new Date('2026-07-01T09:00:00Z'),
      payload: expect.objectContaining({ serverId: EXISTING_TIMER.id }),
    })
  })
})

describe('timers.complete', () => {
  it('throws CONFLICT when version mismatches', async () => {
    // Arrange
    fakeDb = createFakeTimersDb({ timers: [EXISTING_TIMER] })
    const caller = createCaller(makeCtx('u1', fakeDb, fakeScheduler))

    // Act / Assert
    await expect(
      caller.timers.complete({ serverId: EXISTING_TIMER.id, version: 99 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('marks timer completed, writes event, and removes schedule', async () => {
    // Arrange
    fakeDb = createFakeTimersDb({ timers: [EXISTING_TIMER] })
    fakeScheduler.schedules.set(`timer-${EXISTING_TIMER.id}`, {
      name: `timer-${EXISTING_TIMER.id}`,
      targetDatetime: EXISTING_TIMER.targetDatetime,
      payload: { serverId: EXISTING_TIMER.id, userId: 'u1', targetDatetime: EXISTING_TIMER.targetDatetime.toISOString() },
    })
    const caller = createCaller(makeCtx('u1', fakeDb, fakeScheduler))

    // Act
    await caller.timers.complete({ serverId: EXISTING_TIMER.id, version: 1 })

    // Assert
    expect(fakeDb.timers[0].status).toBe('completed')
    expect(fakeDb.timerEvents).toHaveLength(1)
    expect(fakeDb.timerEvents[0].eventType).toBe('completed')
    expect(fakeScheduler.schedules.has(`timer-${EXISTING_TIMER.id}`)).toBe(false)
  })
})

describe('timers.cancel', () => {
  it('throws CONFLICT when version mismatches', async () => {
    // Arrange
    fakeDb = createFakeTimersDb({ timers: [EXISTING_TIMER] })
    const caller = createCaller(makeCtx('u1', fakeDb, fakeScheduler))

    // Act / Assert
    await expect(
      caller.timers.cancel({ serverId: EXISTING_TIMER.id, version: 99 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('marks timer cancelled, writes event, and removes schedule', async () => {
    // Arrange
    fakeDb = createFakeTimersDb({ timers: [EXISTING_TIMER] })
    fakeScheduler.schedules.set(`timer-${EXISTING_TIMER.id}`, {
      name: `timer-${EXISTING_TIMER.id}`,
      targetDatetime: EXISTING_TIMER.targetDatetime,
      payload: { serverId: EXISTING_TIMER.id, userId: 'u1', targetDatetime: EXISTING_TIMER.targetDatetime.toISOString() },
    })
    const caller = createCaller(makeCtx('u1', fakeDb, fakeScheduler))

    // Act
    await caller.timers.cancel({ serverId: EXISTING_TIMER.id, version: 1 })

    // Assert
    expect(fakeDb.timers[0].status).toBe('cancelled')
    expect(fakeDb.timerEvents).toHaveLength(1)
    expect(fakeDb.timerEvents[0].eventType).toBe('cancelled')
    expect(fakeScheduler.schedules.has(`timer-${EXISTING_TIMER.id}`)).toBe(false)
  })
})
