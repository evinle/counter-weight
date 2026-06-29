import { describe, it, expect, beforeEach } from 'vitest'
import { terminateTimer } from './timers.js'
import { TimerStatus, EventType } from '../../db/schema.js'
import { createFakeTimersDb } from '../../test/fakes/timersDb.js'
import { createFakeScheduler } from '../../test/fakes/scheduler.js'
import { timerScheduleKeys } from '../scheduler.js'
import type { FakeTimersDb } from '../../test/fakes/timersDb.js'
import type { FakeScheduler } from '../../test/fakes/scheduler.js'
import type { SpawnCtx, TimerRecord } from './timers.js'
import { mockEnv } from '../../test/envHelpers.js'

const TIMER_ID = '00000000-0000-0000-0000-000000000001'
const USER_ID = 'u1'

const BASE_TIMER = {
  id: TIMER_ID,
  userId: USER_ID,
  title: 'Test timer',
  description: null,
  emoji: null,
  targetDatetime: new Date('2026-06-01T12:00:00Z'),
  originalTargetDatetime: new Date('2026-06-01T12:00:00Z'),
  status: 'active',
  priority: 'medium',
  recurrenceRule: null,
  eventbridgeScheduleId: null,
  version: 1,
  tagIds: [],
  timerType: 'reminder',
  leadTimeMs: null,
  workSessions: [],
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies TimerRecord

let fakeTimersDb: FakeTimersDb
let fakeScheduler: FakeScheduler

function makeCtx(now = new Date('2026-06-01T12:01:00Z')): SpawnCtx {
  return { userId: USER_ID, now, scheduler: fakeScheduler, timersDb: fakeTimersDb }
}

beforeEach(() => {
  mockEnv()
  fakeTimersDb = createFakeTimersDb({ timers: [BASE_TIMER] })
  fakeScheduler = createFakeScheduler()
})

describe('terminateTimer — conflict', () => {
  it('returns conflict when version mismatches, leaves timer unchanged', async () => {
    const result = await terminateTimer(
      { serverId: TIMER_ID, version: 99, status: TimerStatus.Completed, eventType: EventType.Completed },
      makeCtx(),
    )

    expect(result).toBe('conflict')
    expect(fakeTimersDb.timers[0].status).toBe('active')
    expect(fakeTimersDb.timerEvents).toHaveLength(0)
  })
})

describe('terminateTimer — complete', () => {
  it('returns ok, marks timer completed, and writes Completed event', async () => {
    const result = await terminateTimer(
      { serverId: TIMER_ID, version: 1, status: TimerStatus.Completed, eventType: EventType.Completed },
      makeCtx(),
    )

    expect(result).toBe('ok')
    expect(fakeTimersDb.timers[0].status).toBe('completed')
    expect(fakeTimersDb.timerEvents).toHaveLength(1)
    expect(fakeTimersDb.timerEvents[0].eventType).toBe('completed')
    expect(fakeTimersDb.timerEvents[0].timerId).toBe(TIMER_ID)
  })

  it('deletes both schedule keys', async () => {
    const keys = timerScheduleKeys(TIMER_ID)
    fakeScheduler.schedules.set(keys.deadline, { name: keys.deadline, targetDatetime: new Date(), payload: { serverId: TIMER_ID, userId: USER_ID, targetDatetime: '', kind: 'deadline' } })
    fakeScheduler.schedules.set(keys.lead, { name: keys.lead, targetDatetime: new Date(), payload: { serverId: TIMER_ID, userId: USER_ID, targetDatetime: '', kind: 'lead' } })

    await terminateTimer(
      { serverId: TIMER_ID, version: 1, status: TimerStatus.Completed, eventType: EventType.Completed },
      makeCtx(),
    )

    expect(fakeScheduler.schedules.has(keys.deadline)).toBe(false)
    expect(fakeScheduler.schedules.has(keys.lead)).toBe(false)
  })

  it('spawns an active next occurrence with the same recurrence rule for a recurring timer', async () => {
    fakeTimersDb = createFakeTimersDb({ timers: [{ ...BASE_TIMER, recurrenceRule: { cron: '0 9 * * *', tz: 'UTC' } }] })

    await terminateTimer(
      { serverId: TIMER_ID, version: 1, status: TimerStatus.Completed, eventType: EventType.Completed },
      makeCtx(new Date('2026-06-01T09:05:00Z')),
    )

    expect(fakeTimersDb.timers).toHaveLength(2)
    const spawned = fakeTimersDb.timers[1]
    expect(spawned.status).toBe('active')
    expect(spawned.recurrenceRule).toEqual({ cron: '0 9 * * *', tz: 'UTC' })
    expect(spawned.targetDatetime.getTime()).toBeGreaterThan(new Date('2026-06-01T09:05:00Z').getTime())
  })

  it('does not spawn a next occurrence for a non-recurring timer', async () => {
    await terminateTimer(
      { serverId: TIMER_ID, version: 1, status: TimerStatus.Completed, eventType: EventType.Completed },
      makeCtx(),
    )

    expect(fakeTimersDb.timers).toHaveLength(1)
  })
})

describe('terminateTimer — cancel', () => {
  it('returns ok, marks timer cancelled, and writes Cancelled event', async () => {
    const result = await terminateTimer(
      { serverId: TIMER_ID, version: 1, status: TimerStatus.Cancelled, eventType: EventType.Cancelled },
      makeCtx(),
    )

    expect(result).toBe('ok')
    expect(fakeTimersDb.timers[0].status).toBe('cancelled')
    expect(fakeTimersDb.timerEvents).toHaveLength(1)
    expect(fakeTimersDb.timerEvents[0].eventType).toBe('cancelled')
  })

  it('does not spawn a next occurrence even for a recurring timer', async () => {
    fakeTimersDb = createFakeTimersDb({ timers: [{ ...BASE_TIMER, recurrenceRule: { cron: '0 9 * * *', tz: 'UTC' } }] })

    await terminateTimer(
      { serverId: TIMER_ID, version: 1, status: TimerStatus.Cancelled, eventType: EventType.Cancelled },
      makeCtx(),
    )

    expect(fakeTimersDb.timers).toHaveLength(1)
    expect(fakeTimersDb.timers[0].status).toBe('cancelled')
  })
})
