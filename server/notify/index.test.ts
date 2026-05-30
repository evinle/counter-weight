import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { LocalDurableTestRunner, ExecutionStatus } from '@aws/durable-execution-sdk-js-testing'
import { withDurableExecution } from '@aws/durable-execution-sdk-js'
import { buildHandler } from './index.js'
import { createFakeNotifyDb } from '../test/fakes/notifyDb.js'
import { TimerStatus, EventType } from '../db/schema.js'
import type { FakeNotifyDb, FakeTimer, FakePushSubscription } from '../test/fakes/notifyDb.js'
import type { SendNotification } from './handler.js'

// ---- Fixtures ---------------------------------------------------------

const TIMER_ID = '00000000-0000-0000-0000-000000000001'
const USER_ID = 'user-abc'
const FUTURE_DATETIME = '2099-01-01T00:00:00Z'

const activeTimer = {
  id: TIMER_ID,
  userId: USER_ID,
  status: TimerStatus.Active,
  targetDatetime: new Date(FUTURE_DATETIME),
} satisfies FakeTimer

const subscription1 = {
  id: 'sub-1',
  userId: USER_ID,
  endpoint: 'https://push.example.com/1',
  subscription: { p256dh: 'key1', auth: 'auth1', deviceHint: 'Chrome/macOS' },
} satisfies FakePushSubscription

const EVENT = { serverId: TIMER_ID, userId: USER_ID, targetDatetime: FUTURE_DATETIME }

// ---- Test environment -------------------------------------------------

beforeAll(async () => {
  await LocalDurableTestRunner.setupTestEnvironment({ skipTime: true })
})

afterAll(async () => {
  await LocalDurableTestRunner.teardownTestEnvironment()
})

// ---- Tests ------------------------------------------------------------

describe('notify handler (index)', () => {
  let fakeDb: FakeNotifyDb
  let sendNotification: ReturnType<typeof vi.fn> & SendNotification

  beforeEach(() => {
    fakeDb = createFakeNotifyDb({ timers: [activeTimer], subscriptions: [subscription1] })
    sendNotification = vi.fn().mockResolvedValue({ statusCode: 201 }) as ReturnType<typeof vi.fn> & SendNotification
  })

  function makeRunner() {
    const handler = withDurableExecution(buildHandler(
      async () => fakeDb,
      async () => sendNotification,
    ))
    return new LocalDurableTestRunner({ handlerFunction: handler })
  }

  // --- Cycle 1 ---

  it('fires a timer_event after the durable wait for a future targetDatetime', async () => {
    // Arrange — activeTimer with FUTURE_DATETIME seeded in beforeEach

    // Act
    const result = await makeRunner().run({ payload: EVENT })

    // Assert
    expect(result.getStatus()).toBe(ExecutionStatus.SUCCEEDED)
    expect(fakeDb.timerEvents).toHaveLength(1)
    expect(fakeDb.timerEvents[0]).toMatchObject({ timerId: TIMER_ID, eventType: EventType.Fired })
  })

  // --- Cycle 2 ---

  it('fires immediately without a wait when targetDatetime is in the past', async () => {
    // Arrange
    const pastDatetime = '2000-01-01T00:00:00Z'
    fakeDb = createFakeNotifyDb({
      timers: [{ ...activeTimer, targetDatetime: new Date(pastDatetime) }],
      subscriptions: [subscription1],
    })

    // Act
    const result = await makeRunner().run({ payload: { ...EVENT, targetDatetime: pastDatetime } })

    // Assert
    expect(result.getStatus()).toBe(ExecutionStatus.SUCCEEDED)
    expect(fakeDb.timerEvents).toHaveLength(1)
  })
})
