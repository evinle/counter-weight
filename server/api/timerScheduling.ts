import { timerScheduleKeys, overdueScheduleKey } from './scheduler.js'
import { nextRung } from '../notify/nudgeLadder.js'
import type { Scheduler } from './scheduler.js'

export type SchedulingCtx = { userId: string; now: Date; scheduler: Scheduler }

export async function createTimerSchedules(
  serverId: string,
  targetDatetime: Date,
  leadTimeMs: number | null,
  ctx: SchedulingCtx,
): Promise<void> {
  const keys = timerScheduleKeys(serverId)
  await ctx.scheduler.createSchedule(keys.deadline, targetDatetime, {
    serverId,
    userId: ctx.userId,
    targetDatetime: targetDatetime.toISOString(),
    kind: 'deadline',
  })
  if (leadTimeMs !== null) {
    const leadDatetime = new Date(targetDatetime.getTime() - leadTimeMs)
    if (leadDatetime > ctx.now) {
      await ctx.scheduler.createSchedule(keys.lead, leadDatetime, {
        serverId,
        userId: ctx.userId,
        targetDatetime: leadDatetime.toISOString(),
        kind: 'lead',
      })
    }
  }
}

export async function updateTimerSchedules(
  serverId: string,
  targetDatetime: Date,
  leadTimeMs: number | null,
  ctx: SchedulingCtx,
): Promise<void> {
  const keys = timerScheduleKeys(serverId)
  await ctx.scheduler.updateSchedule(keys.deadline, targetDatetime, {
    serverId,
    userId: ctx.userId,
    targetDatetime: targetDatetime.toISOString(),
    kind: 'deadline',
  })
  if (leadTimeMs !== null) {
    const leadDatetime = new Date(targetDatetime.getTime() - leadTimeMs)
    if (leadDatetime > ctx.now) {
      await ctx.scheduler.updateSchedule(keys.lead, leadDatetime, {
        serverId,
        userId: ctx.userId,
        targetDatetime: leadDatetime.toISOString(),
        kind: 'lead',
      })
    } else {
      await ctx.scheduler.deleteSchedule(keys.lead)
    }
  } else {
    await ctx.scheduler.deleteSchedule(keys.lead)
  }
}

export async function deleteTimerSchedules(
  serverId: string,
  scheduler: Scheduler,
): Promise<void> {
  const keys = timerScheduleKeys(serverId)
  await scheduler.deleteSchedule(keys.deadline)
  await scheduler.deleteSchedule(keys.lead)
}

// The overdue chain keeps exactly one future nudge pending, and that is the next rung.
// Best-effort: the Notify Lambda drops a nudge for a timer that is no longer active, so
// a leftover schedule is harmless and must not fail the completion or cancellation.
export async function deleteOverdueSchedule(
  serverId: string,
  targetDatetime: Date,
  now: Date,
  scheduler: Scheduler,
): Promise<void> {
  // The first nudge is only created when the deadline notification fires.
  if (now < targetDatetime) return
  const rung = nextRung(now, targetDatetime)
  if (!rung) return
  try {
    await scheduler.deleteSchedule(overdueScheduleKey(serverId, rung.at))
  } catch (err) {
    console.warn(`[scheduling] could not delete overdue nudge for ${serverId}`, err)
  }
}
