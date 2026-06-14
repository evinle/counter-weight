import 'fake-indexeddb/auto'
import { db } from '../db'
import { SyncStatuses } from '../db/schema'
import type { Group, Timer } from '../db/schema'
import { getFilteredFeed } from '../hooks/useFilteredFeed'

const BASE_CONDITIONS = { op: 'AND' as const, conditions: [] }

const BASE_TIMER = {
  description: null,
  emoji: null,
  targetDatetime: new Date('2026-06-20T12:00:00Z'),
  originalTargetDatetime: new Date('2026-06-20T12:00:00Z'),
  status: 'active' as const,
  priority: 'medium' as const,
  recurrenceRule: null,
  serverId: null,
  userId: 'user-1',
  syncStatus: SyncStatuses.Synced,
  version: null,
  tagIds: [],
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies Omit<Timer, 'id' | 'title'>

const BASE_GROUP = {
  serverId: null,
  userId: 'user-1',
  emoji: null,
  color: null,
  version: null,
  syncStatus: SyncStatuses.Synced,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies Omit<Group, 'id' | 'name' | 'conditions'>

beforeEach(async () => {
  await db.timers.clear()
  await db.groups.clear()
})

describe('getFilteredFeed', () => {
  it('returns all active and fired timers when no group is selected', async () => {
    await db.timers.add({ ...BASE_TIMER, title: 'Active one', status: 'active' })
    await db.timers.add({ ...BASE_TIMER, title: 'Fired one', status: 'fired' })
    await db.timers.add({ ...BASE_TIMER, title: 'Completed one', status: 'completed' })

    const timers = await getFilteredFeed(null)

    expect(timers).toHaveLength(2)
    expect(timers.map(t => t.title)).toContain('Active one')
    expect(timers.map(t => t.title)).toContain('Fired one')
  })

  it('returns only timers matching the selected group conditions', async () => {
    await db.timers.add({ ...BASE_TIMER, title: 'High one', priority: 'high' })
    await db.timers.add({ ...BASE_TIMER, title: 'Medium one', priority: 'medium' })

    const groupId = await db.groups.add({
      ...BASE_GROUP,
      name: 'High priority',
      conditions: { op: 'AND', conditions: [{ field: 'priority', op: 'eq', value: 'high' }] },
    }) as number

    const timers = await getFilteredFeed(groupId)

    expect(timers).toHaveLength(1)
    expect(timers[0].title).toBe('High one')
  })

  it('returns empty when no timers match the selected group conditions', async () => {
    await db.timers.add({ ...BASE_TIMER, title: 'Low one', priority: 'low' })

    const groupId = await db.groups.add({
      ...BASE_GROUP,
      name: 'Critical only',
      conditions: { op: 'AND', conditions: [{ field: 'priority', op: 'eq', value: 'critical' }] },
    }) as number

    const timers = await getFilteredFeed(groupId)

    expect(timers).toHaveLength(0)
  })

  it('filters out non-active/fired timers even when a group has no conditions', async () => {
    await db.timers.add({ ...BASE_TIMER, title: 'Active one', status: 'active' })
    await db.timers.add({ ...BASE_TIMER, title: 'Completed one', status: 'completed' })

    const groupId = await db.groups.add({
      ...BASE_GROUP,
      name: 'All active',
      conditions: BASE_CONDITIONS,
    }) as number

    const timers = await getFilteredFeed(groupId)

    expect(timers).toHaveLength(1)
    expect(timers[0].title).toBe('Active one')
  })
})
