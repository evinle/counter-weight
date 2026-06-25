import { timerScheduleKeys } from './scheduler.js'
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
