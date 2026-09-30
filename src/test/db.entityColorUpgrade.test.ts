import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, it, expect, beforeAll } from 'vitest'
import type { Tag, Group } from '../db/schema'

// Builds a version-7 database holding rows with old hex colours, then opens the real
// database module, which runs the version-8 upgrade.
async function seedVersion7() {
  const old = new Dexie('counter-weight')
  old.version(7).stores({
    timers: '++id, status, targetDatetime, priority, syncStatus, serverId, userId',
    tags: '++id, syncStatus, userId, serverId',
    groups: '++id, syncStatus, userId, serverId',
  })
  const base = { userId: 'u1', emoji: null, version: 1, createdAt: new Date(), updatedAt: new Date() }
  await old.table('tags').bulkAdd([
    { ...base, name: 'Synced tag', color: '#ef4444', serverId: 'srv-t1', syncStatus: 'synced' },
    { ...base, name: 'Local tag', color: '#22c55e', serverId: null, syncStatus: 'synced' },
    { ...base, name: 'No colour', color: null, serverId: 'srv-t2', syncStatus: 'synced' },
  ])
  await old.table('groups').add({
    ...base,
    name: 'Urgent',
    color: '#8b5cf6',
    serverId: 'srv-g1',
    syncStatus: 'synced',
    conditions: { op: 'AND', conditions: [] },
  })
  old.close()
}

describe('database version 8 upgrade', () => {
  let tags: Tag[]
  let groups: Group[]

  beforeAll(async () => {
    await seedVersion7()
    const { db } = await import('../db')
    tags = await db.tags.orderBy('id').toArray()
    groups = await db.groups.toArray()
  })

  it('rewrites old preset colours on tags and groups to slot names', () => {
    expect(tags.map((t) => t.color)).toEqual(['red', 'green', null])
    expect(groups[0].color).toBe('violet')
  })

  it('marks changed rows that are on the server pending, and leaves the rest', () => {
    expect(tags.map((t) => t.syncStatus)).toEqual(['pending', 'synced', 'synced'])
  })
})
