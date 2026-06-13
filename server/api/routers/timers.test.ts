import { describe, it, expect, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'
import { timersRouter, timerUpsertInput } from './timers.js'
import { router, createCallerFactory } from '../router.js'
import { mockEnv } from '../../test/envHelpers.js'
import { createFakeTimersDb } from '../../test/fakes/timersDb.js'
import { createFakeScheduler } from '../../test/fakes/scheduler.js'
import { createFakeTagsDb } from '../../test/fakes/tagsDb.js'
import type { FakeTimersDb } from '../../test/fakes/timersDb.js'
import type { FakeScheduler } from '../../test/fakes/scheduler.js'
import type { FakeTagsDb } from '../../test/fakes/tagsDb.js'
import type { TimerRecord } from './timers.js'
import type { TagRecord } from './tags.js'
import { createFakeDb } from '../../test/fakes/db.js'
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
  recurrenceRule: null,
  version: undefined,
  tagIds: [],
} satisfies TimerUpsertInput

const EXISTING_TAG = {
  id: '00000000-0000-0000-0000-000000000011',
  userId: 'u1',
  name: 'urgent',
  color: '#ff0000',
  emoji: null,
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies TagRecord

const EXISTING_TIMER = {
  id: '00000000-0000-0000-0000-000000000001',
  userId: 'u1',
  title: 'Existing timer',
  description: null,
  emoji: null,
  targetDatetime: new Date('2026-06-01T12:00:00Z'),
  originalTargetDatetime: new Date('2026-06-01T12:00:00Z'),
  status: 'active',
  priority: 'medium',
  recurrenceRule: null,
  eventbridgeScheduleId: null,
  version: 1,
  tagIds: [],
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies TimerRecord

function makeCtx(userId: string | null, timersDb: FakeTimersDb, scheduler: Scheduler, tagsDb?: FakeTagsDb) {
  return { userId, db: createFakeDb(), timersDb, tagsDb: tagsDb ?? createFakeTagsDb(), scheduler, userAgent: null }
}

let fakeDb: FakeTimersDb
let fakeScheduler: FakeScheduler
let fakeTagsDb: FakeTagsDb

beforeEach(() => {
  mockEnv()
  fakeDb = createFakeTimersDb()
  fakeScheduler = createFakeScheduler()
  fakeTagsDb = createFakeTagsDb()
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

describe('timers.reconcile', () => {
  it('response includes serverNow alongside timers', async () => {
    // Arrange
    fakeDb = createFakeTimersDb({ timers: [EXISTING_TIMER] })
    const caller = createCaller(makeCtx('u1', fakeDb, fakeScheduler))

    // Act
    const result = await caller.timers.reconcile({ since: null, records: [] })

    // Assert
    expect(result).toHaveProperty('serverNow')
    expect(typeof result.serverNow).toBe('string')
    expect(result).toHaveProperty('timers')
    expect(Array.isArray(result.timers)).toBe(true)
  })

  it('since: <T> returns only timers updated after T', async () => {
    // Arrange
    const oldTimer = { ...EXISTING_TIMER, id: '00000000-0000-0000-0000-000000000002', updatedAt: new Date('2026-01-01T00:00:00Z') }
    const newTimer = { ...EXISTING_TIMER, id: '00000000-0000-0000-0000-000000000003', updatedAt: new Date('2026-06-01T00:00:00Z') }
    fakeDb = createFakeTimersDb({ timers: [oldTimer, newTimer] })
    const caller = createCaller(makeCtx('u1', fakeDb, fakeScheduler))

    // Act
    const result = await caller.timers.reconcile({ since: '2026-03-01T00:00:00Z', records: [] })

    // Assert
    expect(result.timers).toHaveLength(1)
    expect(result.timers[0].id).toBe(newTimer.id)
  })

  it('since: null returns all timers for the user', async () => {
    // Arrange
    const otherUserTimer = { ...EXISTING_TIMER, id: '00000000-0000-0000-0000-000000000002', userId: 'u2' }
    fakeDb = createFakeTimersDb({ timers: [EXISTING_TIMER, otherUserTimer] })
    const caller = createCaller(makeCtx('u1', fakeDb, fakeScheduler))

    // Act
    const result = await caller.timers.reconcile({ since: null, records: [] })

    // Assert
    expect(result.timers).toHaveLength(1)
    expect(result.timers[0].id).toBe(EXISTING_TIMER.id)
  })

  it('timers include tagIds in reconcile response', async () => {
    // Arrange
    const timerWithTags = { ...EXISTING_TIMER, tagIds: [EXISTING_TAG.id] }
    fakeDb = createFakeTimersDb({ timers: [timerWithTags] })
    const caller = createCaller(makeCtx('u1', fakeDb, fakeScheduler))

    // Act
    const result = await caller.timers.reconcile({ since: null, records: [] })

    // Assert
    expect(result.timers[0].tagIds).toEqual([EXISTING_TAG.id])
  })
})

describe('timers.upsert — tag diff', () => {
  it('insert path stores tagIds on the timer', async () => {
    // Arrange
    fakeTagsDb = createFakeTagsDb({ tags: [EXISTING_TAG] })
    const caller = createCaller(makeCtx('u1', fakeDb, fakeScheduler, fakeTagsDb))

    // Act
    const result = await caller.timers.upsert({ ...BASE_INPUT, tagIds: [EXISTING_TAG.id] })

    // Assert
    expect(fakeDb.timers[0].tagIds).toEqual([EXISTING_TAG.id])
    expect(result.tagIds).toEqual([EXISTING_TAG.id])
  })

  it('update path replaces tagIds (adds new, removes old)', async () => {
    // Arrange
    const tag2 = { ...EXISTING_TAG, id: '00000000-0000-0000-0000-000000000012', name: 'low' }
    const timerWithTag1 = { ...EXISTING_TIMER, tagIds: [EXISTING_TAG.id] }
    fakeDb = createFakeTimersDb({ timers: [timerWithTag1] })
    fakeTagsDb = createFakeTagsDb({ tags: [EXISTING_TAG, tag2] })
    const caller = createCaller(makeCtx('u1', fakeDb, fakeScheduler, fakeTagsDb))

    // Act — swap tag1 for tag2
    const result = await caller.timers.upsert({
      ...BASE_INPUT,
      serverId: EXISTING_TIMER.id,
      version: 1,
      tagIds: [tag2.id],
    })

    // Assert
    expect(fakeDb.timers[0].tagIds).toEqual([tag2.id])
    expect(result.tagIds).toEqual([tag2.id])
  })
})
