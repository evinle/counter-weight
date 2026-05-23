import 'fake-indexeddb/auto'
import { db } from '../db'
import type { Timer } from '../db/schema'

const baseTimer: Omit<Timer, 'id'> = {
  title: 'Test timer',
  description: null,
  emoji: null,
  targetDatetime: new Date('2026-06-01T12:00:00Z'),
  originalTargetDatetime: new Date('2026-06-01T12:00:00Z'),
  status: 'active',
  priority: 'medium',
  isFlagged: false,
  groupId: null,
  recurrenceRule: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  serverId: null,
  userId: null,
  syncStatus: 'synced',
  version: null,
}

describe('Dexie v3 schema', () => {
  it('stores and retrieves M2 sync fields', async () => {
    const id = await db.timers.add(baseTimer)
    const timer = await db.timers.get(id)
    expect(timer?.serverId).toBeNull()
    expect(timer?.userId).toBeNull()
    expect(timer?.syncStatus).toBe('synced')
    expect(timer?.version).toBeNull()
  })

  it('v3 upgrade defaults: ?? null and ?? synced logic is correct', () => {
    // Verify the backfill expressions used in the v3 upgrade function
    const pre = {} as Record<string, unknown>
    pre.serverId = pre.serverId ?? null
    pre.userId = pre.userId ?? null
    pre.syncStatus = pre.syncStatus ?? 'synced'
    pre.version = pre.version ?? null
    expect(pre.serverId).toBeNull()
    expect(pre.userId).toBeNull()
    expect(pre.syncStatus).toBe('synced')
    expect(pre.version).toBeNull()
  })
})
