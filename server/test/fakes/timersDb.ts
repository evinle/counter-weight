import { TimerStatus } from '../../db/schema.js'
import type { EventType } from '../../db/schema.js'
import type { TimersDb, TimerRecord, InsertTimerVals, UpdateTimerVals } from '../../api/routers/timers.js'

export type FakeTimer = TimerRecord
export type FakeTimerEvent = { id: string; timerId: string; userId: string; eventType: EventType; occurredAt: Date }

export type FakeTimersDb = TimersDb & {
  timers: FakeTimer[]
  timerEvents: FakeTimerEvent[]
}

export function createFakeTimersDb(opts: { timers?: FakeTimer[] } = {}): FakeTimersDb {
  let idCounter = 0
  const timers: FakeTimer[] = opts.timers ? [...opts.timers] : []
  const timerEvents: FakeTimerEvent[] = []

  return {
    timers,
    timerEvents,

    async listActive(userId) {
      return timers.filter((t) => t.userId === userId && t.status !== TimerStatus.Cancelled)
    },

    async getTimer(id, userId) {
      return timers.find((t) => t.id === id && t.userId === userId) ?? null
    },

    async insertTimer(vals: InsertTimerVals) {
      idCounter++
      const row: FakeTimer = {
        id: `timer-${idCounter}`,
        eventbridgeScheduleId: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...vals,
      }
      timers.push(row)
      return { serverId: row.id, version: row.version, tagIds: row.tagIds }
    },

    async updateTimer(where, vals: UpdateTimerVals) {
      const idx = timers.findIndex((t) => {
        if (t.id !== where.id || t.userId !== where.userId) return false
        if (where.version !== undefined && t.version !== where.version) return false
        return true
      })
      if (idx === -1) return null

      const prev = timers[idx]
      const updated: FakeTimer = { ...prev, ...vals, version: prev.version + 1, updatedAt: new Date() }
      timers[idx] = updated
      return { serverId: updated.id, version: updated.version, tagIds: updated.tagIds }
    },

    async setStatus(where, status) {
      const idx = timers.findIndex(
        (t) => t.id === where.id && t.userId === where.userId && t.version === where.version,
      )
      if (idx === -1) return null

      timers[idx] = { ...timers[idx], status, version: timers[idx].version + 1, updatedAt: new Date() }
      return { id: timers[idx].id }
    },

    async insertTimerEvent(vals) {
      idCounter++
      timerEvents.push({ id: `event-${idCounter}`, ...vals, occurredAt: new Date() })
    },

    async reconcile(userId, since) {
      return timers.filter((t) => {
        if (t.userId !== userId) return false
        if (since && t.updatedAt <= since) return false
        return true
      })
    },
  }
}
