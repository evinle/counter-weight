import 'fake-indexeddb/auto'
import { db } from '../db'
import { SyncStatuses } from '../db/schema'
import type { Group } from '../db/schema'
import { getGroups, deleteGroup, createGroup } from '../hooks/useGroups'

const BASE_CONDITIONS = { op: 'AND' as const, conditions: [] }

const BASE_GROUP = {
  serverId: 'srv-group-1',
  userId: 'user-1',
  name: 'High Priority',
  emoji: '🔴',
  color: '#ef4444',
  conditions: BASE_CONDITIONS,
  version: 1,
  syncStatus: SyncStatuses.Synced,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies Omit<Group, 'id'>

beforeEach(async () => {
  await db.groups.clear()
})

describe('getGroups', () => {
  it('returns all non-deleted groups', async () => {
    await db.groups.add({ ...BASE_GROUP })
    await db.groups.add({ ...BASE_GROUP, serverId: 'srv-group-2', name: 'Overdue' })
    await db.groups.add({ ...BASE_GROUP, serverId: 'srv-group-3', name: 'Gone', syncStatus: SyncStatuses.Deleted })

    const groups = await getGroups('user-1')

    expect(groups).toHaveLength(2)
    expect(groups.map(g => g.name)).not.toContain('Gone')
  })

  it('returns only groups for the given userId', async () => {
    await db.groups.add({ ...BASE_GROUP, userId: 'user-1' })
    await db.groups.add({ ...BASE_GROUP, serverId: 'srv-group-2', userId: 'user-2' })

    const groups = await getGroups('user-1')

    expect(groups).toHaveLength(1)
    expect(groups[0].userId).toBe('user-1')
  })
})

describe('createGroup', () => {
  it('persists a new group to Dexie with syncStatus pending', async () => {
    const id = await createGroup(
      { name: 'Overdue', emoji: '⚠️', color: '#f59e0b', conditions: BASE_CONDITIONS },
      'user-1',
    )

    const group = await db.groups.get(id)
    expect(group).toBeDefined()
    expect(group?.name).toBe('Overdue')
    expect(group?.syncStatus).toBe(SyncStatuses.Pending)
    expect(group?.userId).toBe('user-1')
  })
})

describe('deleteGroup', () => {
  it('soft-deletes a synced group by setting syncStatus to deleted', async () => {
    const id = await db.groups.add({ ...BASE_GROUP })

    await deleteGroup({ ...BASE_GROUP, id })

    const group = await db.groups.get(id)
    expect(group?.syncStatus).toBe(SyncStatuses.Deleted)
  })

  it('hard-deletes an unsynced group immediately', async () => {
    const id = await db.groups.add({
      ...BASE_GROUP,
      serverId: null,
      syncStatus: SyncStatuses.Pending,
    })

    await deleteGroup({ ...BASE_GROUP, id, serverId: null, syncStatus: SyncStatuses.Pending })

    const group = await db.groups.get(id)
    expect(group).toBeUndefined()
  })
})
