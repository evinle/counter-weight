import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleTimerFired } from './handler.js'
import { TimerStatus, EventType } from '../db/schema.js'
import { createFakeNotifyDb } from '../test/fakes/notifyDb.js'
import type { FakeNotifyDb, FakeTimer, FakePushSubscription } from '../test/fakes/notifyDb.js'
import type { SendNotification } from './handler.js'
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

const PAYLOAD = { serverId: TIMER_ID, userId: USER_ID, targetDatetime: '2026-06-01T12:00:00Z' }

// ---- Tests ------------------------------------------------------------

let fakeDb: FakeNotifyDb
let sendNotification: ReturnType<typeof vi.fn> & SendNotification

beforeEach(() => {
  fakeDb = createFakeNotifyDb()
  sendNotification = fromAny(vi.fn().mockResolvedValue({ statusCode: 201 }))
})

describe('handleTimerFired', () => {
  // --- Cycle 1 ---

  it('guard exits without fan-out or event write when timer is cancelled', async () => {
    // Arrange
    fakeDb = createFakeNotifyDb({
      timers: [cancelledTimer],
      subscriptions: [subscription1],
    })

    // Act
    await handleTimerFired(PAYLOAD, fakeDb, sendNotification)

    // Assert
    expect(fakeDb.timerEvents).toHaveLength(0)
    expect(fakeDb.subscriptions).toHaveLength(1) // unchanged
  })

  it('guard exits without fan-out or event write when timer is not found', async () => {
    // Arrange
    fakeDb = createFakeNotifyDb({ subscriptions: [subscription1] })

    // Act
    await handleTimerFired(PAYLOAD, fakeDb, sendNotification)

    // Assert
    expect(fakeDb.timerEvents).toHaveLength(0)
    expect(fakeDb.subscriptions).toHaveLength(1) // unchanged
  })

  // --- Cycle 2 ---

  it('fans out sendNotification to each subscription and writes a fired timer_event', async () => {
    // Arrange
    fakeDb = createFakeNotifyDb({
      timers: [activeTimer],
      subscriptions: [subscription1, subscription2],
    })

    // Act
    await handleTimerFired(PAYLOAD, fakeDb, sendNotification)

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

  // --- Cycle 3 ---

  it('deletes a push_subscription row when sendNotification rejects with statusCode 410', async () => {
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
    await handleTimerFired(PAYLOAD, fakeDb, sendNotification)

    // Assert: sub-1 removed, sub-2 kept
    expect(fakeDb.subscriptions.map((s) => s.id)).toEqual(['sub-2'])
    // Event still written
    expect(fakeDb.timerEvents).toHaveLength(1)
  })
})
