function parseTime(time: string): { hour: number; min: number } {
  const [h, m] = time.split(':').map(Number)
  return { hour: h, min: m }
}

export function buildDailyCron(time: string): string {
  const { hour, min } = parseTime(time)
  return `${min} ${hour} * * *`
}

export function buildWeekdayCron(time: string): string {
  const { hour, min } = parseTime(time)
  return `${min} ${hour} * * 1-5`
}

export function buildWeeklyCron(time: string, dayOfWeek: number): string {
  const { hour, min } = parseTime(time)
  return `${min} ${hour} * * ${dayOfWeek}`
}

export function buildMonthlyCron(time: string, dayOfMonth: number): string {
  const { hour, min } = parseTime(time)
  return `${min} ${hour} ${dayOfMonth} * *`
}

export function buildCustomWeeklyCron(time: string, days: number[]): string {
  const { hour, min } = parseTime(time)
  const sorted = [...days].sort((a, b) => a - b).join(',')
  return `${min} ${hour} * * ${sorted}`
}

export function buildCustomEveryNDaysCron(time: string, n: number): string {
  const { hour, min } = parseTime(time)
  return `${min} ${hour} */${n} * *`
}

export function buildCustomEveryNHoursCron(n: number): string {
  return `0 */${n} * * *`
}

export function buildCustomEveryNMinutesCron(n: number): string {
  return `*/${n} * * * *`
}

export type ParsedCron =
  | { preset: 'daily'; time: string }
  | { preset: 'weekday'; time: string }
  | { preset: 'weekly'; time: string }
  | { preset: 'monthly'; time: string }
  | { preset: 'custom-weekly'; time: string; days: number[] }
  | { preset: 'custom-monthly'; time: string; dom: number }
  | { preset: 'custom-every-n-days'; time: string; n: number }
  | { preset: 'custom-every-n-hours'; n: number }
  | { preset: 'custom-every-n-minutes'; n: number }

function toTimeString(hour: number, min: number): string {
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

export function parseCron(cron: string): ParsedCron | null {
  const parts = cron.split(' ')
  if (parts.length !== 5) return null
  const [minF, hourF, domF, , dowF] = parts

  // */N minutes
  if (minF.startsWith('*/') && hourF === '*') {
    return { preset: 'custom-every-n-minutes', n: Number(minF.slice(2)) }
  }
  // */N hours
  if (minF === '0' && hourF.startsWith('*/') && domF === '*') {
    return { preset: 'custom-every-n-hours', n: Number(hourF.slice(2)) }
  }

  const min = Number(minF)
  const hour = Number(hourF)
  if (isNaN(min) || isNaN(hour)) return null
  const time = toTimeString(hour, min)

  // every N days
  if (domF.startsWith('*/') && dowF === '*') {
    return { preset: 'custom-every-n-days', time, n: Number(domF.slice(2)) }
  }
  // monthly (numeric dom, * dow)
  if (domF !== '*' && !domF.startsWith('*/') && dowF === '*') {
    return { preset: 'monthly', time }
  }
  // daily (* dom, * dow)
  if (domF === '*' && dowF === '*') {
    return { preset: 'daily', time }
  }
  // weekday
  if (domF === '*' && dowF === '1-5') {
    return { preset: 'weekday', time }
  }
  // custom weekly (comma in dow)
  if (domF === '*' && dowF.includes(',')) {
    return { preset: 'custom-weekly', time, days: dowF.split(',').map(Number) }
  }
  // weekly (single digit dow)
  if (domF === '*' && /^\d$/.test(dowF)) {
    return { preset: 'weekly', time }
  }

  return null
}
