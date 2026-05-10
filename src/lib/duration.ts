export interface DurationValue {
  days: number
  hours: number
  minutes: number
}

export function durationToMs(days: number, hours: number, minutes: number): number {
  return (days * 86400 + hours * 3600 + minutes * 60) * 1000
}

export function msToDuration(ms: number): DurationValue {
  const totalMinutes = Math.floor(ms / 60_000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  return { days, hours, minutes }
}
