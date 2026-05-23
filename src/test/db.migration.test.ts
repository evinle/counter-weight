import 'fake-indexeddb/auto'
import { db } from '../db'

describe('Dexie v3 migration', () => {
  it('upgrade function backfills M2 defaults on pre-migration records', async () => {
    const id = await db.timers.add({
      title: 'Pre-migration timer',
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
      // No M2 fields — simulates a pre-v3 record
    } as any)

    const timer = await db.timers.get(id)
    expect(timer?.serverId).toBeNull()
    expect(timer?.userId).toBeNull()
    expect(timer?.syncStatus).toBe('synced')
    expect(timer?.version).toBeNull()
  })
})
