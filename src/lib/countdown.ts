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
