export type TimerStatus = 'active' | 'fired' | 'completed' | 'missed' | 'cancelled'
export type Priority = 'low' | 'medium' | 'high' | 'critical'

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