import { describe, it, expect, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'
import { groupsRouter } from './groups.js'
import { router, createCallerFactory } from '../router.js'
import { mockEnv } from '../../test/envHelpers.js'
import { createFakeGroupsDb } from '../../test/fakes/groupsDb.js'
import { createFakeDb } from '../../test/fakes/db.js'
import { createFakeScheduler } from '../../test/fakes/scheduler.js'
import { createFakeTimersDb } from '../../test/fakes/timersDb.js'
import { createFakeTagsDb } from '../../test/fakes/tagsDb.js'
import type { FakeGroupsDb } from '../../test/fakes/groupsDb.js'
import type { GroupRecord } from './groups.js'

const testRouter = router({ groups: groupsRouter })
const createCaller = createCallerFactory(testRouter)

const EXISTING_GROUP = {
  id: '00000000-0000-0000-0000-000000000021',
  userId: 'u1',
  name: 'Work',
  emoji: null,
  color: '#3b82f6',
  conditions: { op: 'AND' as const, conditions: [] },
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies GroupRecord

function makeCtx(userId: string | null, groupsDb: FakeGroupsDb) {
  return {
    userId,
    db: createFakeDb(),
    timersDb: createFakeTimersDb(),
    tagsDb: createFakeTagsDb(),
    groupsDb,
    scheduler: createFakeScheduler(),
    userAgent: null,
  }
}

let fakeGroupsDb: FakeGroupsDb

beforeEach(() => {
  mockEnv()
  fakeGroupsDb = createFakeGroupsDb()
})

describe('groups.upsert', () => {
  it('inserts a new group and returns serverId + version', async () => {
    // Arrange
    const caller = createCaller(makeCtx('u1', fakeGroupsDb))

    // Act
    const result = await caller.groups.upsert({
      serverId: null,
      name: 'Work',
      emoji: null,
      color: '#3b82f6',
      conditions: { op: 'AND', conditions: [] },
    })

    // Assert
    expect(fakeGroupsDb.groups).toHaveLength(1)
    expect(fakeGroupsDb.groups[0]).toMatchObject({ userId: 'u1', name: 'Work', color: '#3b82f6' })
    expect(result.serverId).toBe(fakeGroupsDb.groups[0].id)
    expect(result.version).toBe(1)
  })

  it('throws UNAUTHORIZED when unauthenticated', async () => {
    const caller = createCaller(makeCtx(null, fakeGroupsDb))
    await expect(
      caller.groups.upsert({
        serverId: null,
        name: 'Work',
        emoji: null,
        color: null,
        conditions: { op: 'AND', conditions: [] },
      }),
    ).rejects.toThrow(TRPCError)
  })

  it('throws CONFLICT on version mismatch', async () => {
    // Arrange
    fakeGroupsDb = createFakeGroupsDb({ groups: [EXISTING_GROUP] })
    const caller = createCaller(makeCtx('u1', fakeGroupsDb))

    // Act / Assert
    await expect(
      caller.groups.upsert({
        serverId: EXISTING_GROUP.id,
        name: 'Updated',
        emoji: null,
        color: null,
        conditions: { op: 'AND', conditions: [] },
        version: 99,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('updates existing group and bumps version', async () => {
    // Arrange
    fakeGroupsDb = createFakeGroupsDb({ groups: [EXISTING_GROUP] })
    const caller = createCaller(makeCtx('u1', fakeGroupsDb))

    // Act
    const result = await caller.groups.upsert({
      serverId: EXISTING_GROUP.id,
      name: 'Critical Work',
      emoji: '🔥',
      color: '#ef4444',
      conditions: { op: 'AND', conditions: [{ field: 'priority', op: 'eq', value: 'critical' }] },
      version: 1,
    })

    // Assert
    expect(fakeGroupsDb.groups[0]).toMatchObject({ name: 'Critical Work', color: '#ef4444', emoji: '🔥' })
    expect(result.version).toBe(2)
  })
})

describe('groups.reconcile', () => {
  it('returns groups and serverNow', async () => {
    // Arrange
    fakeGroupsDb = createFakeGroupsDb({ groups: [EXISTING_GROUP] })
    const caller = createCaller(makeCtx('u1', fakeGroupsDb))

    // Act
    const result = await caller.groups.reconcile({ since: null, records: [] })

    // Assert
    expect(result).toHaveProperty('serverNow')
    expect(typeof result.serverNow).toBe('string')
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].id).toBe(EXISTING_GROUP.id)
  })

  it('since: <T> returns only groups updated after T', async () => {
    // Arrange
    const oldGroup = { ...EXISTING_GROUP, id: '00000000-0000-0000-0000-000000000022', updatedAt: new Date('2026-01-01T00:00:00Z') }
    const newGroup = { ...EXISTING_GROUP, id: '00000000-0000-0000-0000-000000000023', updatedAt: new Date('2026-06-01T00:00:00Z') }
    fakeGroupsDb = createFakeGroupsDb({ groups: [oldGroup, newGroup] })
    const caller = createCaller(makeCtx('u1', fakeGroupsDb))

    // Act
    const result = await caller.groups.reconcile({ since: '2026-03-01T00:00:00Z', records: [] })

    // Assert
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].id).toBe(newGroup.id)
  })

  it('scopes to userId only', async () => {
    // Arrange
    const otherUserGroup = { ...EXISTING_GROUP, id: '00000000-0000-0000-0000-000000000024', userId: 'u2' }
    fakeGroupsDb = createFakeGroupsDb({ groups: [EXISTING_GROUP, otherUserGroup] })
    const caller = createCaller(makeCtx('u1', fakeGroupsDb))

    // Act
    const result = await caller.groups.reconcile({ since: null, records: [] })

    // Assert
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].id).toBe(EXISTING_GROUP.id)
  })
})

describe('groups.delete', () => {
  it('removes the group', async () => {
    // Arrange
    fakeGroupsDb = createFakeGroupsDb({ groups: [EXISTING_GROUP] })
    const caller = createCaller(makeCtx('u1', fakeGroupsDb))

    // Act
    const result = await caller.groups.delete({ serverId: EXISTING_GROUP.id })

    // Assert
    expect(result).toEqual({ ok: true })
    expect(fakeGroupsDb.groups).toHaveLength(0)
  })
})
