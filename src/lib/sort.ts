import type { Timer, Priority } from '../db/schema'

export const SortModes = {
  Smart: 'smart',
  TargetDatetime: 'targetDatetime',
  CreatedAt: 'createdAt',
  Priority: 'priority',
  Title: 'title',
} as const satisfies Record<string, string>
export type SortMode = typeof SortModes[keyof typeof SortModes]

export const SortDirections = {
  Asc: 'asc',
  Desc: 'desc',
} as const satisfies Record<string, string>
export type SortDirection = typeof SortDirections[keyof typeof SortDirections]

export function isSortMode(v: unknown): v is SortMode {
  return Object.values(SortModes).some(m => m === v)
}

export function isSortDirection(v: unknown): v is SortDirection {
  return Object.values(SortDirections).some(d => d === v)
}

const PRIORITY_WEIGHT: Record<Priority, number> = {
  critical: 50,
  high: 10,
  medium: 3,
  low: 1,
}

export function urgencyScore(timer: Timer, now: Date): number {
  const msUntilFire = timer.targetDatetime.getTime() - now.getTime()
  const hoursUntilFire = msUntilFire / (1000 * 60 * 60)
  const timeScore = hoursUntilFire > 0 ? 10_000 / hoursUntilFire : 10_000_000
  return PRIORITY_WEIGHT[timer.priority] * timeScore
}

export function sortTimers(
  timers: Timer[],
  mode: SortMode,
  direction: SortDirection,
  now: Date,
): Timer[] {
  const sorted = [...timers].sort((a, b) => {
    switch (mode) {
      case SortModes.Smart:
        return urgencyScore(a, now) - urgencyScore(b, now)
      case SortModes.TargetDatetime:
        return a.targetDatetime.getTime() - b.targetDatetime.getTime()
      case SortModes.CreatedAt:
        return a.createdAt.getTime() - b.createdAt.getTime()
      case SortModes.Priority:
        return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]
      case SortModes.Title:
        return a.title.localeCompare(b.title)
    }
  })
  return direction === SortDirections.Desc ? sorted.reverse() : sorted
}
