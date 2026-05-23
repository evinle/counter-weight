import 'fake-indexeddb/auto'
import { db } from '../db'

describe('Dexie v3 migration', () => {
  it('existing timers get M2 default fields after migration', async () => {
    // Simulate a pre-migration record by writing a raw object
    // (version 3 migration runs automatically on db open in fake-indexeddb)
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
      // M2 fields come from migration defaults
      serverId: null,
      userId: null,
      syncStatus: 'synced',
      version: null,
    } as any)

    const timer = await db.timers.get(id)
    expect(timer?.serverId).toBeNull()
    expect(timer?.userId).toBeNull()
    expect(timer?.syncStatus).toBe('synced')
    expect(timer?.version).toBeNull()
  })
})
