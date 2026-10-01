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

export function firesAt(event: TimerEvent): Date {
  switch (event.kind) {
    case 'lead':
      return event.leadAt
    case 'deadline':
      return event.deadline
    case 'overdue':
      return event.nudgeAt
    default: {
      const unhandled: never = event
      throw new Error(`Unhandled event kind: ${JSON.stringify(unhandled)}`)
    }
  }
}

function parseDate(field: string, value: string): Date {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date in schedule payload field "${field}": ${JSON.stringify(value)}`)
  }
  return date
}

export function parseSchedulePayload(wire: SchedulePayload): TimerEvent {
  if (wire.kind === 'overdue') {
    return {
      kind: 'overdue',
      serverId: wire.serverId,
      userId: wire.userId,
      nudgeAt: parseDate('nudgeAt', wire.nudgeAt),
      deadline: parseDate('deadline', wire.deadline),
    }
  }
  const firesAt = parseDate('targetDatetime', wire.targetDatetime)
  if (wire.kind === 'lead') {
    return { kind: 'lead', serverId: wire.serverId, userId: wire.userId, leadAt: firesAt }
  }
  return { kind: 'deadline', serverId: wire.serverId, userId: wire.userId, deadline: firesAt }
}
