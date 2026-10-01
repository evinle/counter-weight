import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleLead, handleDeadline } from './handler.js'
import { createPushFanout } from './pushFanout.js'
import { createNotificationScheduler } from './notificationScheduler.js'
import { createFakeScheduler } from '../test/fakes/scheduler.js'
import type { FakeScheduler } from '../test/fakes/scheduler.js'
import { TimerStatus, EventType } from '../db/schema.js'
import { createFakeNotifyDb } from '../test/fakes/notifyDb.js'
import type { FakeNotifyDb, FakeTimer, FakePushSubscription } from '../test/fakes/notifyDb.js'
import type { SendNotification } from './handler.js'
import type { LeadEvent, DeadlineEvent } from './events.js'
import { fromAny } from '@total-typescript/shoehorn'

// ---- Shared fixtures --------------------------------------------------

const TIMER_ID = '00000000-0000-0000-0000-000000000001'
const USER_ID = 'user-abc'

const activeTimer = {
  id: TIMER_ID,
  userId: USER_ID,
  status: TimerStatus.Active,
  targetDatetime: new Date('2026-06-01T12:00:00Z'),
  title: 'Test timer',
  emoji: '⏰',
} satisfies FakeTimer

const cancelledTimer = {
  id: TIMER_ID,
  userId: USER_ID,
  status: TimerStatus.Cancelled,
  targetDatetime: new Date('2026-06-01T12:00:00Z'),
  title: 'Test timer',
  emoji: null,
} satisfies FakeTimer

const subscription1 = {
  id: 'sub-1',
  userId: USER_ID,
  endpoint: 'https://push.example.com/1',
  subscription: { p256dh: 'key1', auth: 'auth1', deviceHint: 'Chrome/macOS' },
} satisfies FakePushSubscription

const subscription2 = {
  id: 'sub-2',
  userId: USER_ID,
  endpoint: 'https://push.example.com/2',
  subscription: { p256dh: 'key2', auth: 'auth2', deviceHint: 'Safari/iPhone' },
} satisfies FakePushSubscription

const LEAD_EVENT = {
  kind: 'lead',
  serverId: TIMER_ID,
  userId: USER_ID,
  leadAt: new Date('2026-06-01T11:00:00Z'),
} satisfies LeadEvent

const DEADLINE_EVENT = {
  kind: 'deadline',
  serverId: TIMER_ID,
  userId: USER_ID,
  deadline: new Date('2026-06-01T12:00:00Z'),
} satisfies DeadlineEvent

// ---- Tests ------------------------------------------------------------

let fakeDb: FakeNotifyDb
let fakeScheduler: FakeScheduler
let sendNotification: ReturnType<typeof vi.fn> & SendNotification

beforeEach(() => {
  fakeDb = createFakeNotifyDb()
  fakeScheduler = createFakeScheduler()
  sendNotification = fromAny(vi.fn().mockResolvedValue({ statusCode: 201 }))
})

// Lambdas wake at the moment they fire, so `now` defaults to the deadline.
function makeDeps(now = new Date('2026-06-01T12:00:00Z')) {
  return {
    db: fakeDb,
    push: createPushFanout(fakeDb, sendNotification),
    notifications: createNotificationScheduler(fakeScheduler, () => now),
    now: () => now,
  }
}

describe('handleLead', () => {
  it('guard exits without sending when timer is cancelled', async () => {
    // Arrange
    fakeDb = createFakeNotifyDb({ timers: [cancelledTimer], subscriptions: [subscription1] })

    // Act
    await handleLead(LEAD_EVENT, makeDeps())

    // Assert
    expect(sendNotification).not.toHaveBeenCalled()
    expect(fakeDb.subscriptions).toHaveLength(1) // unchanged
  })

  it('guard exits without sending when timer is not found', async () => {
    // Arrange
    fakeDb = createFakeNotifyDb({ subscriptions: [subscription1] })

    // Act
    await handleLead(LEAD_EVENT, makeDeps())

    // Assert
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('sends "Reminder: {title}"', async () => {
    // Arrange
    fakeDb = createFakeNotifyDb({ timers: [activeTimer], subscriptions: [subscription1] })

    // Act
    await handleLead(LEAD_EVENT, makeDeps())

    // Assert
    expect(sendNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ title: 'Reminder: Test timer' }),
    )
  })

  it('does not write a Fired event', async () => {
    // Arrange
    fakeDb = createFakeNotifyDb({ timers: [activeTimer], subscriptions: [subscription1] })

    // Act
    await handleLead(LEAD_EVENT, makeDeps())

    // Assert
    expect(fakeDb.timerEvents).toHaveLength(0)
  })
})

describe('handleDeadline', () => {
  it('guard exits without fan-out or event write when timer is cancelled', async () => {
    // Arrange
    fakeDb = createFakeNotifyDb({
      timers: [cancelledTimer],
      subscriptions: [subscription1],
    })

    // Act
    await handleDeadline(DEADLINE_EVENT, makeDeps())

    // Assert
    expect(fakeDb.timerEvents).toHaveLength(0)
    expect(fakeDb.subscriptions).toHaveLength(1) // unchanged
  })

  it('guard exits without fan-out or event write when timer is not found', async () => {
    // Arrange
    fakeDb = createFakeNotifyDb({ subscriptions: [subscription1] })

    // Act
    await handleDeadline(DEADLINE_EVENT, makeDeps())

    // Assert
    expect(fakeDb.timerEvents).toHaveLength(0)
    expect(fakeDb.subscriptions).toHaveLength(1) // unchanged
  })

  it('fans out sendNotification to each subscription and writes a fired timer_event', async () => {
    // Arrange
    fakeDb = createFakeNotifyDb({
      timers: [activeTimer],
      subscriptions: [subscription1, subscription2],
    })

    // Act
    await handleDeadline(DEADLINE_EVENT, makeDeps())

    // Assert: one fired event recorded
    expect(fakeDb.timerEvents).toHaveLength(1)
    expect(fakeDb.timerEvents[0]).toMatchObject({
      timerId: TIMER_ID,
      userId: USER_ID,
      eventType: EventType.Fired,
    })

    // Assert: both subscriptions still present (no 410s in this test)
    expect(fakeDb.subscriptions).toHaveLength(2)
  })

  it('sends "{title}"', async () => {
    // Arrange
    fakeDb = createFakeNotifyDb({ timers: [activeTimer], subscriptions: [subscription1] })

    // Act
    await handleDeadline(DEADLINE_EVENT, makeDeps())

    // Assert
    expect(sendNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ title: 'Test timer' }),
    )
  })

  it('starts the nudge ladder by scheduling the +15 minute overdue nudge', async () => {
    // Arrange
    fakeDb = createFakeNotifyDb({ timers: [activeTimer], subscriptions: [subscription1] })

    // Act
    await handleDeadline(DEADLINE_EVENT, makeDeps())

    // Assert
    expect([...fakeScheduler.schedules.values()].map((s) => s.payload)).toEqual([
      {
        serverId: TIMER_ID,
        userId: USER_ID,
        kind: 'overdue',
        nudgeAt: '2026-06-01T12:15:00.000Z',
        deadline: '2026-06-01T12:00:00.000Z',
      },
    ])
  })

  it('still writes the fired timer_event when a subscription is gone (410)', async () => {
    // Arrange
    fakeDb = createFakeNotifyDb({
      timers: [activeTimer],
      subscriptions: [subscription1, subscription2],
    })
    const gone410 = Object.assign(new Error('Gone'), { statusCode: 410 })
    sendNotification = fromAny(vi.fn()
      .mockRejectedValueOnce(gone410)         // sub-1 → 410
      .mockResolvedValueOnce({ statusCode: 201 })) // sub-2 → ok

    // Act
    await handleDeadline(DEADLINE_EVENT, makeDeps())

    // Assert
    expect(fakeDb.timerEvents).toHaveLength(1)
  })
})
