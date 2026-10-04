import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { LocalDurableTestRunner, ExecutionStatus } from '@aws/durable-execution-sdk-js-testing'
import { withDurableExecution } from '@aws/durable-execution-sdk-js'
import { buildHandler } from './index.js'
import { createFakeNotifyDb } from '../test/fakes/notifyDb.js'
import { createFakeScheduler } from '../test/fakes/scheduler.js'
import type { FakeScheduler } from '../test/fakes/scheduler.js'
import { TimerStatus, EventType, TimerType } from '../db/schema.js'
import type { FakeNotifyDb, FakeTimer, FakePushSubscription } from '../test/fakes/notifyDb.js'
import type { SendNotification } from './handler.js'
import type { SchedulePayload } from '../api/scheduler.js'
import { fromAny } from '@total-typescript/shoehorn'

// ---- Fixtures ---------------------------------------------------------

const TIMER_ID = '00000000-0000-0000-0000-000000000001'
const USER_ID = 'user-abc'
const FUTURE_DATETIME = '2099-01-01T00:00:00Z'

const activeTimer = {
  id: TIMER_ID,
  userId: USER_ID,
  status: TimerStatus.Active,
  targetDatetime: new Date(FUTURE_DATETIME),
  title: 'Test timer',
  emoji: '⏰',
  timerType: TimerType.Reminder,
  workSessions: [],
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
  let fakeScheduler: FakeScheduler
  let schedulerTargets: string[]
  let sendNotification: ReturnType<typeof vi.fn> & SendNotification

  beforeEach(() => {
    fakeDb = createFakeNotifyDb({ timers: [activeTimer], subscriptions: [subscription1] })
    fakeScheduler = createFakeScheduler()
    schedulerTargets = []
    sendNotification = fromAny(vi.fn().mockResolvedValue({ statusCode: 201 }))
  })

  function makeRunner() {
    const handler = withDurableExecution(buildHandler(
      async () => fakeDb,
      async () => sendNotification,
      async (target) => { schedulerTargets.push(target); return fakeScheduler },
      () => 'live',
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

  // --- Dispatch by kind ---

  it('starts the nudge ladder after a deadline firing, 15 minutes after the deadline', async () => {
    // Arrange — activeTimer with FUTURE_DATETIME seeded in beforeEach

    // Act
    const result = await makeRunner().run({ payload: EVENT })

    // Assert
    expect(result.getStatus()).toBe(ExecutionStatus.SUCCEEDED)
    expect([...fakeScheduler.schedules.values()].map((s) => s.targetDatetime)).toEqual([
      new Date('2099-01-01T00:15:00Z'),
    ])
  })

  it('builds its scheduler to target the alias, so nudges invoke current code the scheduler role may invoke', async () => {
    // Arrange — activeTimer with FUTURE_DATETIME seeded in beforeEach

    // Act
    const result = await makeRunner().run({ payload: EVENT })

    // Assert
    expect(result.getStatus()).toBe(ExecutionStatus.SUCCEEDED)
    expect(schedulerTargets).toHaveLength(1)
    expect(schedulerTargets[0]).toBe('arn:aws:lambda:us-east-2:123456789012:function:my-function-name:live')
  })

  it('sends an overdue nudge after the durable wait for an overdue payload', async () => {
    // Arrange — activeTimer with FUTURE_DATETIME as its deadline, seeded in beforeEach
    const overduePayload = {
      serverId: TIMER_ID,
      userId: USER_ID,
      kind: 'overdue',
      nudgeAt: '2099-01-01T00:15:00Z',
      deadline: FUTURE_DATETIME,
    } satisfies SchedulePayload

    // Act
    const result = await makeRunner().run({ payload: overduePayload })

    // Assert
    expect(result.getStatus()).toBe(ExecutionStatus.SUCCEEDED)
    expect(sendNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: 'overdue' }),
    )
  })

  it('sends the lead reminder and writes no timer_event for kind=lead', async () => {
    // Arrange — activeTimer with FUTURE_DATETIME seeded in beforeEach

    // Act
    const result = await makeRunner().run({ payload: { ...EVENT, kind: 'lead' } })

    // Assert
    expect(result.getStatus()).toBe(ExecutionStatus.SUCCEEDED)
    expect(sendNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ title: 'Reminder: Test timer' }),
    )
    expect(fakeDb.timerEvents).toHaveLength(0)
  })
})
