import 'fake-indexeddb/auto'
import { db } from '../db'
import { createTimer, cancelTimer } from '../hooks/useTimers'

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
