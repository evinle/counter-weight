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
