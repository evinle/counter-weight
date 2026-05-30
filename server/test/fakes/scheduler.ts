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

    async createSchedule(name, targetDatetime, payload) {
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
