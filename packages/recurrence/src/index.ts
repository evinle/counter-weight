import { Cron } from 'croner'

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

export function buildLastDayOfMonthCron(time: string): string {
  const { hour, min } = parseTime(time)
  return `${min} ${hour} L * *`
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

export function buildCustomEveryHMCron(hours: number, minutes: number): string {
  if (minutes === 0) return `0 */${hours} * * *`
  return `*/${hours * 60 + minutes} * * * *`
}

export type ParsedCron =
  | { preset: 'daily'; time: string }
  | { preset: 'weekday'; time: string }
  | { preset: 'weekly'; time: string }
  | { preset: 'monthly'; time: string }
  | { preset: 'custom-weekly'; time: string; days: number[] }
  | { preset: 'custom-monthly'; time: string; dom: number | 'L' }
  | { preset: 'custom-every-n-days'; time: string; n: number }
  | { preset: 'custom-every-hm'; hours: number; minutes: number }

function toTimeString(hour: number, min: number): string {
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

export function parseCron(cron: string): ParsedCron | null {
  const parts = cron.split(' ')
  if (parts.length !== 5) return null
  const [minF, hourF, domF, , dowF] = parts

  if (minF.startsWith('*/') && hourF === '*') {
    const total = Number(minF.slice(2))
    return { preset: 'custom-every-hm', hours: Math.floor(total / 60), minutes: total % 60 }
  }
  if (minF === '0' && hourF.startsWith('*/') && domF === '*') {
    return { preset: 'custom-every-hm', hours: Number(hourF.slice(2)), minutes: 0 }
  }

  const min = Number(minF)
  const hour = Number(hourF)
  if (isNaN(min) || isNaN(hour)) return null
  const time = toTimeString(hour, min)

  if (domF.startsWith('*/') && dowF === '*') {
    return { preset: 'custom-every-n-days', time, n: Number(domF.slice(2)) }
  }
  if (domF === 'L' && dowF === '*') {
    return { preset: 'custom-monthly', time, dom: 'L' }
  }
  if (domF !== '*' && !domF.startsWith('*/') && dowF === '*') {
    return { preset: 'monthly', time }
  }
  if (domF === '*' && dowF === '*') {
    return { preset: 'daily', time }
  }
  if (domF === '*' && dowF === '1-5') {
    return { preset: 'weekday', time }
  }
  if (domF === '*' && dowF.includes(',')) {
    return { preset: 'custom-weekly', time, days: dowF.split(',').map(Number) }
  }
  if (domF === '*' && /^\d$/.test(dowF)) {
    return { preset: 'weekly', time }
  }

  return null
}

const PARSED_CRON_PRESETS = [
  'daily', 'weekday', 'weekly', 'monthly',
  'custom-weekly', 'custom-monthly', 'custom-every-n-days', 'custom-every-hm',
] as const

export function isParsedCron(v: unknown): v is ParsedCron {
  return (
    typeof v === 'object' &&
    v !== null &&
    'preset' in v &&
    (PARSED_CRON_PRESETS as readonly string[]).includes((v as { preset: unknown }).preset as string)
  )
}

export function nextOccurrence(cron: string, tz: string, now = new Date()): Date {
  const job = new Cron(cron, { timezone: tz })
  const next = job.nextRun(now)
  if (!next) throw new Error(`No next occurrence for cron "${cron}"`)
  return next
}
