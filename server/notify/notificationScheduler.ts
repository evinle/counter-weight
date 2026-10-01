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
      // A nudge that is already due has nothing left to wait for, so skip the API call.
      if (event.nudgeAt.getTime() <= now().getTime()) {
        console.warn(`[notify] not scheduling overdue nudge for ${event.serverId}: ${event.nudgeAt.toISOString()} has passed`)
        return
      }
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
