const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

export const NUDGE_LADDER_MS = [
  15 * MINUTE_MS,
  1 * HOUR_MS,
  4 * HOUR_MS,
  1 * DAY_MS,
  7 * DAY_MS,
] as const

export type Rung = { index: number; at: Date }

export function nextRung(now: Date, targetDatetime: Date): Rung | null {
  const diffMs = now.getTime() - targetDatetime.getTime()
  const index = NUDGE_LADDER_MS.findIndex((offsetMs) => offsetMs > diffMs)
  if (index === -1) return null
  return { index, at: new Date(targetDatetime.getTime() + NUDGE_LADDER_MS[index]) }
}

// "15m", "1h 20m", "1d 1h" — whole minutes, largest units first, zero units dropped.
export function formatOverdueBy(overdueMs: number): string {
  const totalMinutes = Math.floor(overdueMs / MINUTE_MS)
  const days = Math.floor(totalMinutes / (24 * 60))
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60)
  const minutes = totalMinutes % 60
  return [
    days > 0 ? `${days}d` : null,
    hours > 0 ? `${hours}h` : null,
    minutes > 0 ? `${minutes}m` : null,
  ]
    .filter((part) => part !== null)
    .join(' ')
}
