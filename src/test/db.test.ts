import 'fake-indexeddb/auto'
import { db } from '../db'

describe('db', () => {
  beforeEach(async () => {
    await db.timers.clear()
  })

  it('creates and retrieves a timer', async () => {
    const id = await db.timers.add({
      title: 'Test timer',
      targetDatetime: new Date(Date.now() + 60_000),
      originalTargetDatetime: new Date(Date.now() + 60_000),
      status: 'active',
      priority: 'medium',
      isFlagged: false,
      emoji: null,
      description: null,
      groupId: null,
      recurrenceRule: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const timer = await db.timers.get(id)
    expect(timer?.title).toBe('Test timer')
    expect(timer?.status).toBe('active')
  })

  it('updates a timer status', async () => {
    const id = await db.timers.add({
      title: 'Test timer',
      targetDatetime: new Date(Date.now() + 60_000),
      originalTargetDatetime: new Date(Date.now() + 60_000),
      status: 'active',
      priority: 'medium',
      isFlagged: false,
      emoji: null,
      description: null,
      groupId: null,
      recurrenceRule: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await db.timers.update(id, { status: 'completed' })
    const timer = await db.timers.get(id)
    expect(timer?.status).toBe('completed')
  })
})

describe('history query', () => {
  beforeEach(async () => {
    await db.timers.clear()
  })

  it('returns completed, missed, and cancelled timers sorted by targetDatetime descending, excluding active', async () => {
    const base = {
      priority: 'medium' as const,
      isFlagged: false,
      emoji: null,
      description: null,
      groupId: null,
      recurrenceRule: null,
      originalTargetDatetime: new Date('2026-01-01'),
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    await db.timers.add({ ...base, title: 'Active', targetDatetime: new Date('2026-03-01'), status: 'active' })
    await db.timers.add({ ...base, title: 'Completed', targetDatetime: new Date('2026-01-01'), status: 'completed' })
    await db.timers.add({ ...base, title: 'Missed', targetDatetime: new Date('2026-02-01'), status: 'missed' })
    await db.timers.add({ ...base, title: 'Cancelled', targetDatetime: new Date('2026-03-01'), status: 'cancelled' })

    const results = await db.timers
      .where('status')
      .anyOf('completed', 'missed', 'cancelled')
      .toArray()
      .then((arr) =>
        arr.sort((a, b) => b.targetDatetime.getTime() - a.targetDatetime.getTime())
      )

    expect(results).toHaveLength(3)
    expect(results.map((t) => t.title)).toEqual(['Cancelled', 'Missed', 'Completed'])
  })
})
