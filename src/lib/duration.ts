export interface DurationValue {
  days: number
  hours: number
  minutes: number
  seconds: number
}

export function durationToMs(days: number, hours: number, minutes: number, seconds: number): number {
  return (days * 86400 + hours * 3600 + minutes * 60 + seconds) * 1000
}

export function msToDuration(ms: number): DurationValue {
  const totalSeconds = Math.floor(ms / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return { days, hours, minutes, seconds }
}
