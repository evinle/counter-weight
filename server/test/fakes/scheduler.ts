import type { Scheduler, SchedulePayload } from '../../api/scheduler.js'

export type FakeScheduleRecord = {
  name: string
  targetDatetime: Date
  payload: SchedulePayload
}

export type FakeScheduler = Scheduler & {
  schedules: Map<string, FakeScheduleRecord>
}

export function createFakeScheduler(): FakeScheduler {
  const schedules = new Map<string, FakeScheduleRecord>()

  return {
    schedules,

    // Like EventBridge Scheduler, creating a name that already exists is a conflict.
    async createSchedule(name, targetDatetime, payload) {
      if (schedules.has(name)) throw new Error(`ConflictException: schedule ${name} already exists`)
      schedules.set(name, { name, targetDatetime, payload })
    },

    async updateSchedule(name, targetDatetime, payload) {
      schedules.set(name, { name, targetDatetime, payload })
    },

    async deleteSchedule(name) {
      schedules.delete(name)
    },
  }
}
