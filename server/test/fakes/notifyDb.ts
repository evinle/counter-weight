import { TimerStatus, EventType } from '../../db/schema.js'
import type { NotifyDb } from '../../notify/handler.js'

// ---- Row shapes -------------------------------------------------------

export type FakeTimer = {
  id: string
  userId: string
  status: TimerStatus
  targetDatetime: Date
}

export type FakePushSubscription = {
  id: string
  userId: string
  endpoint: string
  subscription: { p256dh: string; auth: string; deviceHint: string }
}

export type FakeTimerEvent = {
  id: string
  timerId: string
  userId: string
  eventType: EventType
  occurredAt: Date
}

// ---- Fake implementation ----------------------------------------------

export type FakeNotifyDb = NotifyDb & {
  // Exposed for state-based assertions in tests
  timers: FakeTimer[]
  subscriptions: FakePushSubscription[]
  timerEvents: FakeTimerEvent[]
}

export function createFakeNotifyDb(
  opts: {
    timers?: FakeTimer[]
    subscriptions?: FakePushSubscription[]
    timerEvents?: FakeTimerEvent[]
  } = {},
): FakeNotifyDb {
  const timers: FakeTimer[] = opts.timers ?? []
  const subscriptions: FakePushSubscription[] = opts.subscriptions ?? []
  const timerEvents: FakeTimerEvent[] = opts.timerEvents ?? []

  let eventIdCounter = 0

  const db: FakeNotifyDb = {
    timers,
    subscriptions,
    timerEvents,

    // NotifyDb interface ---

    async getTimerByServerId(serverId: string): Promise<FakeTimer | null> {
      return timers.find((t) => t.id === serverId) ?? null
    },

    async getSubscriptionsForUser(userId: string): Promise<FakePushSubscription[]> {
      return subscriptions.filter((s) => s.userId === userId)
    },

    async deleteSubscription(id: string): Promise<void> {
      const idx = subscriptions.findIndex((s) => s.id === id)
      if (idx !== -1) subscriptions.splice(idx, 1)
    },

    async insertTimerEvent(event: {
      timerId: string
      userId: string
      eventType: EventType
    }): Promise<void> {
      eventIdCounter += 1
      timerEvents.push({
        id: `event-${eventIdCounter}`,
        timerId: event.timerId,
        userId: event.userId,
        eventType: event.eventType,
        occurredAt: new Date(),
      })
    },
  }

  return db
}
