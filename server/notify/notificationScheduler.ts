import { overdueScheduleKey } from '../api/scheduler.js'
import type { Scheduler } from '../api/scheduler.js'
import type { OverdueEvent } from './events.js'

export type NotificationScheduler = {
  schedule(event: OverdueEvent): Promise<void>
}

export function createNotificationScheduler(
  scheduler: Scheduler,
  now: () => Date,
): NotificationScheduler {
  return {
    async schedule(event) {
      await scheduler.updateSchedule(overdueScheduleKey(event.serverId, event.nudgeAt), event.nudgeAt, {
        serverId: event.serverId,
        userId: event.userId,
        kind: 'overdue',
        nudgeAt: event.nudgeAt.toISOString(),
        deadline: event.deadline.toISOString(),
      })
    },
  }
}
