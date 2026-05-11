export const TIMER_STATUSES = ['active', 'fired', 'completed', 'missed', 'cancelled'] as const
export type TimerStatus = typeof TIMER_STATUSES[number]
export function isTimerStatus(v: string): v is TimerStatus {
  return (TIMER_STATUSES as readonly string[]).includes(v)
}

export const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const
export type Priority = typeof PRIORITIES[number]
export function isPriority(v: string): v is Priority {
  return (PRIORITIES as readonly string[]).includes(v)
}

export interface Timer {
  id?: number
  title: string
  description: string | null
  emoji: string | null
  targetDatetime: Date
  status: TimerStatus
  priority: Priority
  isFlagged: boolean
  groupId: number | null
  recurrenceRule: { cron: string; tz: string } | null
  createdAt: Date
  updatedAt: Date
}

export const HISTORY_STATUSES = ['completed', 'missed', 'cancelled'] as const satisfies ReadonlyArray<TimerStatus>
export type HistoryStatus = typeof HISTORY_STATUSES[number]
export function isHistoryStatus(value: unknown): value is HistoryStatus{
  return typeof value === 'string' && HISTORY_STATUSES.some(historyStatus => historyStatus === (value))
}
