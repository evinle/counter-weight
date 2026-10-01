import type { SchedulePayload } from '../api/scheduler.js'

export type LeadEvent = { kind: 'lead'; serverId: string; userId: string; leadAt: Date }
export type DeadlineEvent = { kind: 'deadline'; serverId: string; userId: string; deadline: Date }
export type OverdueEvent = {
  kind: 'overdue'
  serverId: string
  userId: string
  nudgeAt: Date
  deadline: Date
}

export type TimerEvent = LeadEvent | DeadlineEvent | OverdueEvent

export function parseSchedulePayload(wire: SchedulePayload): TimerEvent {
  if (wire.kind === 'overdue') {
    return {
      kind: 'overdue',
      serverId: wire.serverId,
      userId: wire.userId,
      nudgeAt: new Date(wire.nudgeAt),
      deadline: new Date(wire.deadline),
    }
  }
  const firesAt = new Date(wire.targetDatetime)
  if (wire.kind === 'lead') {
    return { kind: 'lead', serverId: wire.serverId, userId: wire.userId, leadAt: firesAt }
  }
  return { kind: 'deadline', serverId: wire.serverId, userId: wire.userId, deadline: firesAt }
}
