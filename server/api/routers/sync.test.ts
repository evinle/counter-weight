import { describe, it, expect, beforeEach } from 'vitest'
import { syncRouter } from './sync.js'
import { router, createCallerFactory } from '../router.js'
import { mockEnv } from '../../test/envHelpers.js'
import { createFakeTimersDb } from '../../test/fakes/timersDb.js'
import { createFakeTagsDb } from '../../test/fakes/tagsDb.js'
import { createFakeGroupsDb } from '../../test/fakes/groupsDb.js'
import { createFakeScheduler } from '../../test/fakes/scheduler.js'
import { createFakeDb } from '../../test/fakes/db.js'
import type { FakeTimersDb } from '../../test/fakes/timersDb.js'
import type { FakeTagsDb } from '../../test/fakes/tagsDb.js'
import type { FakeGroupsDb } from '../../test/fakes/groupsDb.js'
import type { FakeScheduler } from '../../test/fakes/scheduler.js'
import type { TagRecord } from './tags.js'
import type { GroupRecord } from './groups.js'
import type { TimerRecord } from './timers.js'

const testRouter = router({ sync: syncRouter })
const createCaller = createCallerFactory(testRouter)

function makeCtx(
  userId: string | null,
  tagsDb: FakeTagsDb,
  groupsDb: FakeGroupsDb,
  timersDb: FakeTimersDb,
  scheduler: FakeScheduler,
  now = new Date(),
) {
  return { userId, db: createFakeDb(), tagsDb, groupsDb, timersDb, scheduler, now, userAgent: null }
}

const EMPTY_INPUT = {
  since: null,
  tags: [],
  groups: [],
  timers: [],
}

let fakeTagsDb: FakeTagsDb
let fakeGroupsDb: FakeGroupsDb
let fakeTimersDb: FakeTimersDb
let fakeScheduler: FakeScheduler

beforeEach(() => {
  mockEnv()
  fakeTagsDb = createFakeTagsDb()
  fakeGroupsDb = createFakeGroupsDb()
  fakeTimersDb = createFakeTimersDb()
  fakeScheduler = createFakeScheduler()
})

describe('sync.full', () => {
  it('throws UNAUTHORIZED when userId is null', async () => {
    // Arrange
    const caller = createCaller(makeCtx(null, fakeTagsDb, fakeGroupsDb, fakeTimersDb, fakeScheduler))

    // Act / Assert
    await expect(caller.sync.full(EMPTY_INPUT)).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('returns all server records in overruled when since is null (full reconcile)', async () => {
    // Arrange
    const existingTag = {
      id: 'tag-server-1',
      userId: 'u1',
      name: 'work',
      color: null,
      emoji: null,
      version: 1,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    } satisfies TagRecord
    fakeTagsDb = createFakeTagsDb({ tags: [existingTag] })
    const caller = createCaller(makeCtx('u1', fakeTagsDb, fakeGroupsDb, fakeTimersDb, fakeScheduler))

    // Act
    const result = await caller.sync.full(EMPTY_INPUT)

    // Assert
    expect(result.synced).toEqual({ tags: [], groups: [], timers: [] })
    expect(result.overruled.tags).toHaveLength(1)
    expect(result.overruled.tags[0]).toMatchObject({ id: 'tag-server-1', name: 'work' })
    expect(result.serverNow).toBeDefined()
  })

  it('new tag upsert (serverId null) echoes clientId and server-assigned serverId in synced', async () => {
    // Arrange
    const caller = createCaller(makeCtx('u1', fakeTagsDb, fakeGroupsDb, fakeTimersDb, fakeScheduler))

    // Act
    const result = await caller.sync.full({
      since: null,
      tags: [{ op: 'upsert', clientId: 42, serverId: null, name: 'focus', color: null, emoji: null }],
      groups: [],
      timers: [],
    })

    // Assert
    expect(result.synced.tags).toHaveLength(1)
    expect(result.synced.tags[0]).toMatchObject({ op: 'upsert', clientId: 42 })
    expect(typeof (result.synced.tags[0] as { serverId: string }).serverId).toBe('string')
    expect(fakeTagsDb.tags).toHaveLength(1)
    expect(fakeTagsDb.tags[0].name).toBe('focus')
  })

  it('existing tag upsert (serverId present) echoes clientId and serverId in synced', async () => {
    // Arrange
    const existing = {
      id: '00000000-0000-0000-0000-000000000099',
      userId: 'u1',
      name: 'old-name',
      color: null,
      emoji: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies TagRecord
    fakeTagsDb = createFakeTagsDb({ tags: [existing] })
    const caller = createCaller(makeCtx('u1', fakeTagsDb, fakeGroupsDb, fakeTimersDb, fakeScheduler))

    // Act
    const result = await caller.sync.full({
      since: null,
      tags: [{ op: 'upsert', clientId: 7, serverId: existing.id, name: 'new-name', color: null, emoji: null, version: 1 }],
      groups: [],
      timers: [],
    })

    // Assert
    expect(result.synced.tags).toHaveLength(1)
    expect(result.synced.tags[0]).toMatchObject({ op: 'upsert', clientId: 7, serverId: existing.id })
    expect(fakeTagsDb.tags[0].name).toBe('new-name')
  })

  it('timer tagIds referencing a tag created in the same batch are resolved to server UUID', async () => {
    // Arrange
    const caller = createCaller(makeCtx('u1', fakeTagsDb, fakeGroupsDb, fakeTimersDb, fakeScheduler))

    // Act
    const result = await caller.sync.full({
      since: null,
      tags: [{ op: 'upsert', clientId: 10, serverId: null, name: 'batch-tag', color: null, emoji: null }],
      groups: [],
      timers: [{
        op: 'upsert',
        clientId: 20,
        serverId: null,
        tagIds: [{ clientId: 10, serverId: null }],
        title: 'Task with tag',
        description: null,
        emoji: null,
        targetDatetime: '2026-12-01T10:00:00Z',
        originalTargetDatetime: '2026-12-01T10:00:00Z',
        status: 'active',
        priority: 'medium',
        recurrenceRule: null,
        timerType: 'task',
        leadTimeMs: null,
        workSessions: [],
      }],
    })

    // Assert
    expect(result.synced.tags).toHaveLength(1)
    expect(result.synced.timers).toHaveLength(1)
    const createdTagServerId = (result.synced.tags[0] as { serverId: string }).serverId
    expect(fakeTimersDb.timers[0].tagIds).toEqual([createdTagServerId])
  })

  it('version conflict during tag drain appends server record to overruled and continues', async () => {
    // Arrange
    const serverTag = {
      id: '00000000-0000-0000-0000-000000000010',
      userId: 'u1',
      name: 'server-version',
      color: null,
      emoji: null,
      version: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies TagRecord
    fakeTagsDb = createFakeTagsDb({ tags: [serverTag] })
    const caller = createCaller(makeCtx('u1', fakeTagsDb, fakeGroupsDb, fakeTimersDb, fakeScheduler))

    // Act
    const result = await caller.sync.full({
      since: null,
      tags: [
        { op: 'upsert', clientId: 1, serverId: serverTag.id, name: 'client-version', color: null, emoji: null, version: 1 },
        { op: 'upsert', clientId: 2, serverId: null, name: 'new-tag', color: null, emoji: null },
      ],
      groups: [],
      timers: [],
    })

    // Assert
    expect(result.synced.tags).toHaveLength(1)
    expect(result.synced.tags[0]).toMatchObject({ op: 'upsert', clientId: 2 })
    expect(result.overruled.tags.some((t) => t.id === serverTag.id && t.name === 'server-version')).toBe(true)
  })

  it('version conflict during group drain appends server record to overruled and continues', async () => {
    // Arrange
    const serverGroup = {
      id: '00000000-0000-0000-0000-000000000050',
      userId: 'u1',
      name: 'server-group',
      emoji: null,
      color: null,
      conditions: { op: 'AND' as const, conditions: [] },
      version: 4,
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies GroupRecord
    fakeGroupsDb = createFakeGroupsDb({ groups: [serverGroup] })
    const caller = createCaller(makeCtx('u1', fakeTagsDb, fakeGroupsDb, fakeTimersDb, fakeScheduler))

    // Act
    const result = await caller.sync.full({
      since: null,
      tags: [],
      groups: [
        { op: 'upsert', clientId: 3, serverId: serverGroup.id, name: 'client-group', emoji: null, color: null, conditions: { op: 'AND', conditions: [] }, version: 1 },
        { op: 'upsert', clientId: 4, serverId: null, name: 'new-group', emoji: null, color: null, conditions: { op: 'AND', conditions: [] } },
      ],
      timers: [],
    })

    // Assert
    expect(result.synced.groups).toHaveLength(1)
    expect(result.synced.groups[0]).toMatchObject({ op: 'upsert', clientId: 4 })
    expect(result.overruled.groups.some((g) => g.id === serverGroup.id && g.name === 'server-group')).toBe(true)
  })

  it('version conflict during timer drain appends server record to overruled and continues', async () => {
    // Arrange
    const serverTimer = {
      id: '00000000-0000-0000-0000-000000000001',
      userId: 'u1',
      title: 'server-title',
      description: null,
      emoji: null,
      targetDatetime: new Date('2026-06-01T12:00:00Z'),
      originalTargetDatetime: new Date('2026-06-01T12:00:00Z'),
      status: 'active',
      priority: 'medium',
      recurrenceRule: null,
      eventbridgeScheduleId: null,
      version: 3,
      tagIds: [],
      timerType: 'reminder',
      leadTimeMs: null,
      workSessions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies TimerRecord
    fakeTimersDb = createFakeTimersDb({ timers: [serverTimer] })
    const caller = createCaller(makeCtx('u1', fakeTagsDb, fakeGroupsDb, fakeTimersDb, fakeScheduler))

    // Act
    const result = await caller.sync.full({
      since: null,
      tags: [],
      groups: [],
      timers: [{
        op: 'upsert',
        clientId: 99,
        serverId: serverTimer.id,
        version: 1,
        tagIds: [],
        title: 'client-title',
        description: null,
        emoji: null,
        targetDatetime: '2026-06-01T12:00:00Z',
        originalTargetDatetime: '2026-06-01T12:00:00Z',
        status: 'active',
        priority: 'medium',
        recurrenceRule: null,
        timerType: 'reminder',
        leadTimeMs: null,
        workSessions: [],
      }],
    })

    // Assert
    expect(result.synced.timers).toHaveLength(0)
    expect(result.overruled.timers.some((t) => t.id === serverTimer.id && t.title === 'server-title')).toBe(true)
  })

  it('tag delete op removes tag and echoes { op: delete, serverId } in synced', async () => {
    // Arrange
    const existing = {
      id: '00000000-0000-0000-0000-000000000020',
      userId: 'u1',
      name: 'to-delete',
      color: null,
      emoji: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies TagRecord
    fakeTagsDb = createFakeTagsDb({ tags: [existing] })
    const caller = createCaller(makeCtx('u1', fakeTagsDb, fakeGroupsDb, fakeTimersDb, fakeScheduler))

    // Act
    const result = await caller.sync.full({
      since: null,
      tags: [{ op: 'delete', clientId: 5, serverId: existing.id }],
      groups: [],
      timers: [],
    })

    // Assert
    expect(result.synced.tags).toHaveLength(1)
    expect(result.synced.tags[0]).toEqual({ op: 'delete', serverId: existing.id })
    expect(fakeTagsDb.tags).toHaveLength(0)
  })

  it('delete of non-existent tag silently succeeds', async () => {
    // Arrange
    const caller = createCaller(makeCtx('u1', fakeTagsDb, fakeGroupsDb, fakeTimersDb, fakeScheduler))

    // Act / Assert
    await expect(caller.sync.full({
      since: null,
      tags: [{ op: 'delete', clientId: 5, serverId: '00000000-0000-0000-0000-000000000099' }],
      groups: [],
      timers: [],
    })).resolves.toBeDefined()
  })

  it('complete timer op marks status, echoes in synced, and deletes EventBridge schedules', async () => {
    // Arrange
    const timerId = '00000000-0000-0000-0000-000000000030'
    const serverTimer = {
      id: timerId,
      userId: 'u1',
      title: 'Finish report',
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
      timerType: 'task',
      leadTimeMs: null,
      workSessions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies TimerRecord
    fakeTimersDb = createFakeTimersDb({ timers: [serverTimer] })
    fakeScheduler.schedules.set(`timer-${timerId}`, { name: `timer-${timerId}`, targetDatetime: new Date(), payload: { serverId: timerId, userId: 'u1', targetDatetime: '', kind: 'deadline' } })
    const caller = createCaller(makeCtx('u1', fakeTagsDb, fakeGroupsDb, fakeTimersDb, fakeScheduler))

    // Act
    const result = await caller.sync.full({
      since: null,
      tags: [],
      groups: [],
      timers: [{ op: 'complete', clientId: 55, serverId: timerId, version: 1 }],
    })

    // Assert
    expect(result.synced.timers).toHaveLength(1)
    expect(result.synced.timers[0]).toMatchObject({ op: 'complete', clientId: 55, serverId: timerId })
    expect(fakeTimersDb.timers[0].status).toBe('completed')
    expect(fakeScheduler.schedules.has(`timer-${timerId}`)).toBe(false)
  })

  it('cancel timer op marks status, echoes in synced, and deletes EventBridge schedules', async () => {
    // Arrange
    const timerId = '00000000-0000-0000-0000-000000000031'
    const serverTimer = {
      id: timerId,
      userId: 'u1',
      title: 'Old task',
      description: null,
      emoji: null,
      targetDatetime: new Date('2026-06-01T12:00:00Z'),
      originalTargetDatetime: new Date('2026-06-01T12:00:00Z'),
      status: 'active',
      priority: 'low',
      recurrenceRule: null,
      eventbridgeScheduleId: null,
      version: 2,
      tagIds: [],
      timerType: 'reminder',
      leadTimeMs: null,
      workSessions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies TimerRecord
    fakeTimersDb = createFakeTimersDb({ timers: [serverTimer] })
    const caller = createCaller(makeCtx('u1', fakeTagsDb, fakeGroupsDb, fakeTimersDb, fakeScheduler))

    // Act
    const result = await caller.sync.full({
      since: null,
      tags: [],
      groups: [],
      timers: [{ op: 'cancel', clientId: 66, serverId: timerId, version: 2 }],
    })

    // Assert
    expect(result.synced.timers[0]).toMatchObject({ op: 'cancel', clientId: 66, serverId: timerId })
    expect(fakeTimersDb.timers[0].status).toBe('cancelled')
  })
})
