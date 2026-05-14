import 'fake-indexeddb/auto'
import { db } from '../db'
import { createTimer, cancelTimer, editTimer, bulkImportTimers } from '../hooks/useTimers'
import type { Timer } from '../db/schema'

const BASE = {
  title: 'Test',
  description: null,
  emoji: null,
  targetDatetime: new Date('2026-06-01T12:00:00Z'),
  status: 'active' as const,
  priority: 'medium' as const,
  isFlagged: false,
  groupId: null,
  recurrenceRule: null,
}

beforeEach(async () => {
  await db.timers.clear()
})

describe('createTimer', () => {
  it('sets originalTargetDatetime equal to targetDatetime', async () => {
    const id = await createTimer(BASE)
    const timer = await db.timers.get(id!)
    expect(timer?.originalTargetDatetime.getTime()).toBe(BASE.targetDatetime.getTime())
  })
})

describe('cancelTimer', () => {
  it('sets status to cancelled', async () => {
    const id = await createTimer(BASE)
    await cancelTimer(id!)
    const timer = await db.timers.get(id!)
    expect(timer?.status).toBe('cancelled')
  })

  it('updates updatedAt', async () => {
    const before = new Date()
    const id = await createTimer(BASE)
    await cancelTimer(id!)
    const timer = await db.timers.get(id!)
    expect(timer?.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
  })
})

describe('editTimer', () => {
  it('allows first deadline extension', async () => {
    const id = await createTimer(BASE)
    const extended = new Date('2026-06-01T14:00:00Z') // 2h later
    await editTimer(id!, { targetDatetime: extended, title: 'Test', emoji: null, priority: 'medium' })
    const timer = await db.timers.get(id!)
    expect(timer?.targetDatetime.getTime()).toBe(extended.getTime())
  })

  it('blocks a second extension', async () => {
    const id = await createTimer(BASE)
    const first = new Date('2026-06-01T14:00:00Z')
    await editTimer(id!, { targetDatetime: first, title: 'Test', emoji: null, priority: 'medium' })
    const second = new Date('2026-06-01T16:00:00Z')
    await editTimer(id!, { targetDatetime: second, title: 'Test', emoji: null, priority: 'medium' })
    const timer = await db.timers.get(id!)
    // targetDatetime should still be `first`, not `second`
    expect(timer?.targetDatetime.getTime()).toBe(first.getTime())
  })

  it('allows reducing the deadline even after an extension', async () => {
    const id = await createTimer(BASE)
    const extended = new Date('2026-06-01T14:00:00Z')
    await editTimer(id!, { targetDatetime: extended, title: 'Test', emoji: null, priority: 'medium' })
    const earlier = new Date('2026-06-01T11:00:00Z')
    await editTimer(id!, { targetDatetime: earlier, title: 'Test', emoji: null, priority: 'medium' })
    const timer = await db.timers.get(id!)
    expect(timer?.targetDatetime.getTime()).toBe(earlier.getTime())
  })
})

describe('bulkImportTimers', () => {
  it('inserts multiple timers and assigns new ids', async () => {
    const timers: Omit<Timer, 'id'>[] = [
      {
        title: 'Imported A',
        description: null,
        emoji: null,
        targetDatetime: new Date('2026-07-01T10:00:00Z'),
        originalTargetDatetime: new Date('2026-07-01T10:00:00Z'),
        status: 'active',
        priority: 'medium',
        isFlagged: false,
        groupId: null,
        recurrenceRule: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]
    await bulkImportTimers(timers)
    const all = await db.timers.toArray()
    expect(all.some(t => t.title === 'Imported A')).toBe(true)
  })
})
