import { overdueScheduleKey, SCHEDULER_EARLY_FIRE_MS } from '../api/scheduler.js'
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
      // EventBridge needs the early-fire time (nudgeAt minus the early-fire offset) to be in the future.
      const earliestFire = event.nudgeAt.getTime() - SCHEDULER_EARLY_FIRE_MS
      if (earliestFire <= now().getTime()) {
        console.warn(`[notify] not scheduling overdue nudge for ${event.serverId}: ${event.nudgeAt.toISOString()} is too close or past`)
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
