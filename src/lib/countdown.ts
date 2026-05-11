export function timeRemaining(target: Date): number {
  return target.getTime() - Date.now()
}

export function formatDuration(ms: number): string {
  if (ms < 0) return '-' + formatDuration(-ms)
  const totalSeconds = Math.floor(ms / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const hms = [hours, minutes, seconds]
    .map((v) => String(v).padStart(2, '0'))
    .join(':')

  return days > 0 ? `${days}d ${hms}` : hms
}

export const ALL_HISTORY_TIMINGS = ['early', 'on-time', 'overdue'] as const

export const HistoryTiming = {
  Early: 'early',
  OnTime: 'on-time',
  Overdue: 'overdue',
} as const satisfies Record<string, typeof ALL_HISTORY_TIMINGS[number]>
export type HistoryTiming = typeof HistoryTiming[keyof typeof HistoryTiming]

export function getHistoryAnnotation(
  targetDatetime: Date,
  updatedAt: Date
): { text: string; timing: HistoryTiming } {
  const diffMs = targetDatetime.getTime() - updatedAt.getTime()
  if (diffMs > 0) return { text: formatDuration(diffMs), timing: HistoryTiming.Early }
  if (diffMs < 0) return { text: formatDuration(-diffMs), timing: HistoryTiming.Overdue }
  return { text: formatDuration(0), timing: HistoryTiming.OnTime }
}
