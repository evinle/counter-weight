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
