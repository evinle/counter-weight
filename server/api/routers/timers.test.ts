import { describe, it, expect, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'
import { timersRouter, timerUpsertInput } from './timers.js'
import { router, createCallerFactory } from '../router.js'
import { mockEnv } from '../../test/envHelpers.js'
import { createFakeTimersDb } from '../../test/fakes/timersDb.js'
import { createFakeScheduler } from '../../test/fakes/scheduler.js'
import { createFakeTagsDb } from '../../test/fakes/tagsDb.js'
import { createFakeGroupsDb } from '../../test/fakes/groupsDb.js'
import type { FakeTimersDb } from '../../test/fakes/timersDb.js'
import type { FakeScheduler } from '../../test/fakes/scheduler.js'
import type { FakeTagsDb } from '../../test/fakes/tagsDb.js'
import type { TimerRecord } from './timers.js'
import type { TagRecord } from './tags.js'
import { createFakeDb } from '../../test/fakes/db.js'
import { timerScheduleKeys } from '../scheduler.js'
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
  timerType: 'reminder',
  leadTimeMs: null,
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
  timerType: 'reminder',
  leadTimeMs: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies TimerRecord

function makeCtx(userId: string | null, timersDb: FakeTimersDb, scheduler: Scheduler, tagsDb?: FakeTagsDb, now = new Date()) {
  return { userId, db: createFakeDb(), timersDb, tagsDb: tagsDb ?? createFakeTagsDb(), groupsDb: createFakeGroupsDb(), scheduler, now, userAgent: null }
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
    const schedule = fakeScheduler.schedules.get(timerScheduleKeys(result.serverId).deadline)
    expect(schedule).toMatchObject({
      targetDatetime: new Date('2026-06-01T12:00:00Z'),
      payload: { serverId: result.serverId, userId: 'u1', targetDatetime: '2026-06-01T12:00:00Z', kind: 'deadline' },
    })
  })

  it('creates both deadline and lead schedules when leadTimeMs is set', async () => {
    // Arrange — now is well before both fire times
    const now = new Date('2026-05-01T00:00:00Z')
    const caller = createCaller(makeCtx('u1', fakeDb, fakeScheduler, undefined, now))

    // Act
    const result = await caller.timers.upsert({
      ...BASE_INPUT,
      leadTimeMs: 30 * 60 * 1000, // 30 minutes
      targetDatetime: '2026-06-01T12:00:00Z',
    })

    // Assert — deadline schedule created
    const keys = timerScheduleKeys(result.serverId)
    expect(fakeScheduler.schedules.get(keys.deadline)).toMatchObject({
      targetDatetime: new Date('2026-06-01T12:00:00Z'),
      payload: { kind: 'deadline' },
    })

    // Assert — lead schedule created at targetDatetime - 30min
    expect(fakeScheduler.schedules.get(keys.lead)).toMatchObject({
      targetDatetime: new Date('2026-06-01T11:30:00Z'),
      payload: { kind: 'lead' },
    })
  })

  it('skips lead schedule when lead fire time is already past', async () => {
    // Arrange — now is after the lead fire time (30min before deadline) but before deadline
    const now = new Date('2026-06-01T11:45:00Z')
    const caller = createCaller(makeCtx('u1', fakeDb, fakeScheduler, undefined, now))

    // Act
    const result = await caller.timers.upsert({
      ...BASE_INPUT,
      leadTimeMs: 30 * 60 * 1000,
      targetDatetime: '2026-06-01T12:00:00Z',
    })

    // Assert — only deadline schedule exists
    const keys = timerScheduleKeys(result.serverId)
    expect(fakeScheduler.schedules.has(keys.deadline)).toBe(true)
    expect(fakeScheduler.schedules.has(keys.lead)).toBe(false)
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

  it('updates both deadline and lead schedules when leadTimeMs is set on existing timer', async () => {
    // Arrange
    const timerWithLead = { ...EXISTING_TIMER, leadTimeMs: 30 * 60 * 1000 }
    fakeDb = createFakeTimersDb({ timers: [timerWithLead] })
    const now = new Date('2026-05-01T00:00:00Z')
    const caller = createCaller(makeCtx('u1', fakeDb, fakeScheduler, undefined, now))

    // Act
    await caller.timers.upsert({
      ...BASE_INPUT,
      serverId: EXISTING_TIMER.id,
      version: 1,
      leadTimeMs: 30 * 60 * 1000,
      targetDatetime: '2026-07-01T09:00:00Z',
    })

    // Assert — deadline updated
    const keys = timerScheduleKeys(EXISTING_TIMER.id)
    expect(fakeScheduler.schedules.get(keys.deadline)).toMatchObject({
      targetDatetime: new Date('2026-07-01T09:00:00Z'),
      payload: { kind: 'deadline' },
    })

    // Assert — lead updated to new targetDatetime - 30min
    expect(fakeScheduler.schedules.get(keys.lead)).toMatchObject({
      targetDatetime: new Date('2026-07-01T08:30:00Z'),
      payload: { kind: 'lead' },
    })
  })

  it('deletes stale lead schedule when lead fire time becomes past on edit', async () => {
    // Arrange — lead schedule already exists in EventBridge
    const timerWithLead = { ...EXISTING_TIMER, leadTimeMs: 30 * 60 * 1000 }
    fakeDb = createFakeTimersDb({ timers: [timerWithLead] })
    const staleKeys = timerScheduleKeys(EXISTING_TIMER.id)
    fakeScheduler.schedules.set(staleKeys.lead, {
      name: staleKeys.lead,
      targetDatetime: new Date('2026-06-01T11:30:00Z'),
      payload: { serverId: EXISTING_TIMER.id, userId: 'u1', targetDatetime: '2026-06-01T12:00:00Z', kind: 'lead' },
    })
    // now is after lead fire time — lead is stale
    const now = new Date('2026-06-01T11:45:00Z')
    const caller = createCaller(makeCtx('u1', fakeDb, fakeScheduler, undefined, now))

    // Act
    await caller.timers.upsert({
      ...BASE_INPUT,
      serverId: EXISTING_TIMER.id,
      version: 1,
      leadTimeMs: 30 * 60 * 1000,
      targetDatetime: '2026-06-01T12:00:00Z',
    })

    // Assert — lead schedule deleted
    expect(fakeScheduler.schedules.has(staleKeys.lead)).toBe(false)
    // deadline still present
    expect(fakeScheduler.schedules.has(staleKeys.deadline)).toBe(true)
  })

  it('exits gracefully when lead fire time is past and no lead schedule exists', async () => {
    // Arrange — lead schedule was never created (e.g. it already fired and EventBridge removed it)
    fakeDb = createFakeTimersDb({ timers: [EXISTING_TIMER] })
    const now = new Date('2026-06-01T11:45:00Z')
    const caller = createCaller(makeCtx('u1', fakeDb, fakeScheduler, undefined, now))

    // Act — should not throw even though there is no lead schedule to delete
    await expect(
      caller.timers.upsert({
        ...BASE_INPUT,
        serverId: EXISTING_TIMER.id,
        version: 1,
        leadTimeMs: 30 * 60 * 1000,
        targetDatetime: '2026-06-01T12:00:00Z',
      }),
    ).resolves.toBeDefined()

    // Assert — deadline still updated, lead remains absent
    const keys = timerScheduleKeys(EXISTING_TIMER.id)
    expect(fakeScheduler.schedules.has(keys.deadline)).toBe(true)
    expect(fakeScheduler.schedules.has(keys.lead)).toBe(false)
  })

  it('propagates scheduler errors that are not ResourceNotFoundException', async () => {
    // Arrange — scheduler throws an unexpected error on deleteSchedule
    fakeDb = createFakeTimersDb({ timers: [EXISTING_TIMER] })
    const now = new Date('2026-06-01T11:45:00Z')
    const throwingScheduler: Scheduler = {
      ...fakeScheduler,
      deleteSchedule: async () => { throw new Error('Network failure') },
    }
    const caller = createCaller(makeCtx('u1', fakeDb, throwingScheduler, undefined, now))

    // Act / Assert
    await expect(
      caller.timers.upsert({
        ...BASE_INPUT,
        serverId: EXISTING_TIMER.id,
        version: 1,
        leadTimeMs: 30 * 60 * 1000,
        targetDatetime: '2026-06-01T12:00:00Z',
      }),
    ).rejects.toThrow('Network failure')
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
    const schedule = fakeScheduler.schedules.get(timerScheduleKeys(EXISTING_TIMER.id).deadline)
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

  it('marks timer completed, writes event, and removes both schedule keys', async () => {
    // Arrange
    fakeDb = createFakeTimersDb({ timers: [EXISTING_TIMER] })
    const completeKeys = timerScheduleKeys(EXISTING_TIMER.id)
    fakeScheduler.schedules.set(completeKeys.deadline, {
      name: completeKeys.deadline,
      targetDatetime: EXISTING_TIMER.targetDatetime,
      payload: { serverId: EXISTING_TIMER.id, userId: 'u1', targetDatetime: EXISTING_TIMER.targetDatetime.toISOString() },
    })
    fakeScheduler.schedules.set(completeKeys.lead, {
      name: completeKeys.lead,
      targetDatetime: EXISTING_TIMER.targetDatetime,
      payload: { serverId: EXISTING_TIMER.id, userId: 'u1', targetDatetime: EXISTING_TIMER.targetDatetime.toISOString(), kind: 'lead' },
    })
    const caller = createCaller(makeCtx('u1', fakeDb, fakeScheduler))

    // Act
    await caller.timers.complete({ serverId: EXISTING_TIMER.id, version: 1 })

    // Assert
    expect(fakeDb.timers[0].status).toBe('completed')
    expect(fakeDb.timerEvents).toHaveLength(1)
    expect(fakeDb.timerEvents[0].eventType).toBe('completed')
    expect(fakeScheduler.schedules.has(completeKeys.deadline)).toBe(false)
    expect(fakeScheduler.schedules.has(completeKeys.lead)).toBe(false)
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

  it('marks timer cancelled, writes event, and removes both schedule keys', async () => {
    // Arrange
    fakeDb = createFakeTimersDb({ timers: [EXISTING_TIMER] })
    const cancelKeys = timerScheduleKeys(EXISTING_TIMER.id)
    fakeScheduler.schedules.set(cancelKeys.deadline, {
      name: cancelKeys.deadline,
      targetDatetime: EXISTING_TIMER.targetDatetime,
      payload: { serverId: EXISTING_TIMER.id, userId: 'u1', targetDatetime: EXISTING_TIMER.targetDatetime.toISOString() },
    })
    fakeScheduler.schedules.set(cancelKeys.lead, {
      name: cancelKeys.lead,
      targetDatetime: EXISTING_TIMER.targetDatetime,
      payload: { serverId: EXISTING_TIMER.id, userId: 'u1', targetDatetime: EXISTING_TIMER.targetDatetime.toISOString(), kind: 'lead' },
    })
    const caller = createCaller(makeCtx('u1', fakeDb, fakeScheduler))

    // Act
    await caller.timers.cancel({ serverId: EXISTING_TIMER.id, version: 1 })

    // Assert
    expect(fakeDb.timers[0].status).toBe('cancelled')
    expect(fakeDb.timerEvents).toHaveLength(1)
    expect(fakeDb.timerEvents[0].eventType).toBe('cancelled')
    expect(fakeScheduler.schedules.has(cancelKeys.deadline)).toBe(false)
    expect(fakeScheduler.schedules.has(cancelKeys.lead)).toBe(false)
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
