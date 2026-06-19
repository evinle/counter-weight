import 'fake-indexeddb/auto'
import { db } from '../db'
import { createTimer, cancelTimer, completeTimer, editTimer, bulkImportTimers, claimTimers, removeUnclaimedTimers, startWork, endWork, doneTask } from '../hooks/useTimers'
import { TimerType } from '../db/schema'
import type { Timer } from '../db/schema'

const BASE = {
  title: 'Test',
  description: null,
  emoji: null,
  targetDatetime: new Date('2026-06-01T12:00:00Z'),
  status: 'active',
  priority: 'medium',
  recurrenceRule: null,
  tagIds: [],
  timerType: TimerType.Reminder,
  leadTimeMs: null,
  workSessions: [],
} satisfies Omit<Timer, 'id' | 'createdAt' | 'updatedAt' | 'originalTargetDatetime' | 'serverId' | 'userId' | 'syncStatus' | 'version'>

beforeEach(async () => {
  await db.timers.clear()
})

describe('createTimer', () => {
  it('sets originalTargetDatetime equal to targetDatetime', async () => {
    const id = await createTimer(BASE, null)
    const timer = await db.timers.get(id!)
    expect(timer?.originalTargetDatetime.getTime()).toBe(BASE.targetDatetime.getTime())
  })

  it('sets syncStatus pending when userId is provided', async () => {
    const id = await createTimer(BASE, 'user-1')
    const timer = await db.timers.get(id!)
    expect(timer?.syncStatus).toBe('pending')
  })

  it('sets syncStatus synced for guest (null userId)', async () => {
    const id = await createTimer(BASE, null)
    const timer = await db.timers.get(id!)
    expect(timer?.syncStatus).toBe('synced')
  })
})

describe('completeTimer', () => {
  it('sets status to completed', async () => {
    const id = await createTimer(BASE, null)
    await completeTimer(id!)
    const timer = await db.timers.get(id!)
    expect(timer?.status).toBe('completed')
  })

  it('sets syncStatus pending', async () => {
    const id = await createTimer(BASE, null)
    await completeTimer(id!)
    const timer = await db.timers.get(id!)
    expect(timer?.syncStatus).toBe('pending')
  })

  it('updates updatedAt', async () => {
    const before = new Date()
    const id = await createTimer(BASE, null)
    await completeTimer(id!)
    const timer = await db.timers.get(id!)
    expect(timer?.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
  })
})

describe('cancelTimer', () => {
  it('sets status to cancelled', async () => {
    const id = await createTimer(BASE, null)
    await cancelTimer(id!)
    const timer = await db.timers.get(id!)
    expect(timer?.status).toBe('cancelled')
  })

  it('updates updatedAt', async () => {
    const before = new Date()
    const id = await createTimer(BASE, null)
    await cancelTimer(id!)
    const timer = await db.timers.get(id!)
    expect(timer?.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
  })

  it('sets syncStatus pending', async () => {
    const id = await createTimer(BASE, null)
    await cancelTimer(id!)
    const timer = await db.timers.get(id!)
    expect(timer?.syncStatus).toBe('pending')
  })
})

describe('editTimer', () => {
  it('allows first deadline extension', async () => {
    const id = await createTimer(BASE, null)
    const extended = new Date('2026-06-01T14:00:00Z') // 2h later
    await editTimer(id!, { targetDatetime: extended, title: 'Test', emoji: null, priority: 'medium', tagIds: [] })
    const timer = await db.timers.get(id!)
    expect(timer?.targetDatetime.getTime()).toBe(extended.getTime())
  })

  it('blocks a second extension', async () => {
    const id = await createTimer(BASE, null)
    const first = new Date('2026-06-01T14:00:00Z')
    await editTimer(id!, { targetDatetime: first, title: 'Test', emoji: null, priority: 'medium', tagIds: [] })
    const second = new Date('2026-06-01T16:00:00Z')
    await editTimer(id!, { targetDatetime: second, title: 'Test', emoji: null, priority: 'medium', tagIds: [] })
    const timer = await db.timers.get(id!)
    // targetDatetime should still be `first`, not `second`
    expect(timer?.targetDatetime.getTime()).toBe(first.getTime())
  })

  it('returns false when a second extension is blocked', async () => {
    const id = await createTimer(BASE, null)
    const first = new Date('2026-06-01T14:00:00Z')
    await editTimer(id!, { targetDatetime: first, title: 'Test', emoji: null, priority: 'medium', tagIds: [] })
    const second = new Date('2026-06-01T16:00:00Z')
    const result = await editTimer(id!, { targetDatetime: second, title: 'Test', emoji: null, priority: 'medium', tagIds: [] })
    expect(result).toBe(false)
  })

  it('allows reducing the deadline even after an extension', async () => {
    const id = await createTimer(BASE, null)
    const extended = new Date('2026-06-01T14:00:00Z')
    await editTimer(id!, { targetDatetime: extended, title: 'Test', emoji: null, priority: 'medium', tagIds: [] })
    const earlier = new Date('2026-06-01T11:00:00Z')
    await editTimer(id!, { targetDatetime: earlier, title: 'Test', emoji: null, priority: 'medium', tagIds: [] })
    const timer = await db.timers.get(id!)
    expect(timer?.targetDatetime.getTime()).toBe(earlier.getTime())
  })

  it('sets syncStatus pending on a successful edit', async () => {
    const id = await createTimer(BASE, null)
    const extended = new Date('2026-06-01T14:00:00Z')
    await editTimer(id!, { targetDatetime: extended, title: 'Test', emoji: null, priority: 'medium', tagIds: [] })
    const timer = await db.timers.get(id!)
    expect(timer?.syncStatus).toBe('pending')
  })

  it('updates non-time fields when targetDatetime is omitted', async () => {
    const id = await createTimer(BASE, null)
    await editTimer(id!, { title: 'Renamed', emoji: '🔥', priority: 'high', tagIds: ['tag-1'] })
    const timer = await db.timers.get(id!)
    expect(timer?.title).toBe('Renamed')
    expect(timer?.emoji).toBe('🔥')
    expect(timer?.priority).toBe('high')
    expect(timer?.tagIds).toEqual(['tag-1'])
  })

  it('preserves targetDatetime when omitted', async () => {
    const id = await createTimer(BASE, null)
    await editTimer(id!, { title: 'Renamed', emoji: null, priority: 'medium', tagIds: [] })
    const timer = await db.timers.get(id!)
    expect(timer?.targetDatetime.getTime()).toBe(BASE.targetDatetime.getTime())
  })

  it('applies non-time edits on an already-extended timer', async () => {
    const extended = new Date('2026-06-01T14:00:00Z')
    const id = await db.timers.add({
      ...BASE,
      tagIds: [],
      targetDatetime: extended,
      originalTargetDatetime: BASE.targetDatetime,
      createdAt: new Date(),
      updatedAt: new Date(),
      serverId: null,
      userId: null,
      syncStatus: 'synced',
      version: null,
    })
    await editTimer(id!, { title: 'Retitled', emoji: null, priority: 'high', tagIds: ['tag-1'] })
    const timer = await db.timers.get(id!)
    expect(timer?.title).toBe('Retitled')
    expect(timer?.priority).toBe('high')
    expect(timer?.tagIds).toEqual(['tag-1'])
    expect(timer?.targetDatetime.getTime()).toBe(extended.getTime())
  })
})

describe('claimTimers', () => {
  it('stamps all userId:null timers with the given userId and syncStatus pending', async () => {
    await createTimer(BASE, null)
    await createTimer(BASE, null)
    await claimTimers('user-1')
    const all = await db.timers.toArray()
    expect(all.every(t => t.userId === 'user-1')).toBe(true)
    expect(all.every(t => t.syncStatus === 'pending')).toBe(true)
  })

  it('does not modify timers that already have a userId', async () => {
    await createTimer(BASE, 'existing-user')
    await createTimer(BASE, null)
    await claimTimers('user-1')
    const all = await db.timers.toArray()
    const existing = all.find(t => t.userId === 'existing-user')
    expect(existing).toBeDefined()
    expect(existing!.syncStatus).toBe('pending') // createTimer sets pending for non-null userId
  })

  it('claims timers of all statuses', async () => {
    for (const status of ['active', 'fired', 'completed', 'missed', 'cancelled'] as const) {
      await createTimer({ ...BASE, status }, null)
    }
    await claimTimers('user-1')
    const all = await db.timers.toArray()
    expect(all.every(t => t.userId === 'user-1')).toBe(true)
  })
})

describe('removeUnclaimedTimers', () => {
  it('deletes all userId:null timers', async () => {
    await createTimer(BASE, null)
    await createTimer(BASE, null)
    await removeUnclaimedTimers()
    const all = await db.timers.toArray()
    expect(all).toHaveLength(0)
  })

  it('does not delete timers that have a userId', async () => {
    await createTimer(BASE, 'user-1')
    await createTimer(BASE, null)
    await removeUnclaimedTimers()
    const all = await db.timers.toArray()
    expect(all).toHaveLength(1)
    expect(all[0].userId).toBe('user-1')
  })
})

describe('startWork', () => {
  it('appends a new open session', async () => {
    const id = await createTimer({ ...BASE, timerType: TimerType.Task }, null)
    await startWork(id!)
    const timer = await db.timers.get(id!)
    expect(timer?.workSessions).toHaveLength(1)
    expect(timer?.workSessions[0].endedAt).toBeNull()
  })

  it('no-ops if a session is already open', async () => {
    const id = await createTimer({ ...BASE, timerType: TimerType.Task }, null)
    await startWork(id!)
    await startWork(id!)
    const timer = await db.timers.get(id!)
    expect(timer?.workSessions).toHaveLength(1)
  })

  it('appends a second session after the first is closed', async () => {
    const id = await createTimer({ ...BASE, timerType: TimerType.Task }, null)
    await startWork(id!)
    await endWork(id!)
    await startWork(id!)
    const timer = await db.timers.get(id!)
    expect(timer?.workSessions).toHaveLength(2)
    expect(timer?.workSessions[1].endedAt).toBeNull()
  })
})

describe('endWork', () => {
  it('closes the last open session', async () => {
    const id = await createTimer({ ...BASE, timerType: TimerType.Task }, null)
    await startWork(id!)
    await endWork(id!)
    const timer = await db.timers.get(id!)
    expect(timer?.workSessions[0].endedAt).not.toBeNull()
  })

  it('no-ops when no open session exists', async () => {
    const id = await createTimer({ ...BASE, timerType: TimerType.Task }, null)
    await endWork(id!)
    const timer = await db.timers.get(id!)
    expect(timer?.workSessions).toHaveLength(0)
  })
})

describe('doneTask', () => {
  it('closes an open session and completes the timer', async () => {
    const id = await createTimer({ ...BASE, timerType: TimerType.Task }, null)
    await startWork(id!)
    await doneTask(id!)
    const timer = await db.timers.get(id!)
    expect(timer?.status).toBe('completed')
    expect(timer?.workSessions[0].endedAt).not.toBeNull()
  })

  it('completes the timer even with no open session', async () => {
    const id = await createTimer({ ...BASE, timerType: TimerType.Task }, null)
    await doneTask(id!)
    const timer = await db.timers.get(id!)
    expect(timer?.status).toBe('completed')
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
        recurrenceRule: null,
        tagIds: [],
        timerType: TimerType.Reminder,
        leadTimeMs: null,
        workSessions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        serverId: null,
        userId: null,
        syncStatus: 'synced',
        version: null,
      },
    ]
    await bulkImportTimers(timers)
    const all = await db.timers.toArray()
    expect(all.some(t => t.title === 'Imported A')).toBe(true)
  })
})
