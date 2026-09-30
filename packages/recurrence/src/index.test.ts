import { describe, it, expect } from 'vitest'
import {
  nextOccurrence,
  isValidCron,
  computePeriodMs,
  buildDailyCron,
  buildWeeklyCron,
  buildCustomEveryNDaysCron,
  buildCustomEveryHMCron,
} from './index.ts'

describe('nextOccurrence', () => {
  it('returns the next run date for a valid daily cron', () => {
    // daily at 09:00 UTC; now is 08:00 UTC — next run is today at 09:00
    const now = new Date('2026-06-21T08:00:00Z')
    const result = nextOccurrence('0 9 * * *', 'UTC', now)
    expect(result).toEqual(new Date('2026-06-21T09:00:00Z'))
  })

  it('returns the next day when now is after the daily trigger', () => {
    // daily at 09:00 UTC; now is 10:00 UTC — next run is tomorrow
    const now = new Date('2026-06-21T10:00:00Z')
    const result = nextOccurrence('0 9 * * *', 'UTC', now)
    expect(result).toEqual(new Date('2026-06-22T09:00:00Z'))
  })

  it('respects the timezone parameter', () => {
    // daily at 09:00 Australia/Sydney = 23:00 UTC previous day
    // now is 2026-06-21T08:00 UTC (= 2026-06-21T18:00 AEST)
    // next 09:00 AEST = 2026-06-21T23:00 UTC
    const now = new Date('2026-06-21T08:00:00Z')
    const result = nextOccurrence('0 9 * * *', 'Australia/Sydney', now)
    expect(result).toEqual(new Date('2026-06-21T23:00:00Z'))
  })

  it('throws when no next occurrence exists', () => {
    // This cron is structurally valid but will never fire (Feb 30)
    expect(() => nextOccurrence('0 9 30 2 *', 'UTC', new Date())).toThrow()
  })
})

describe('computePeriodMs', () => {
  // Pin now to a stable weekday to avoid DST or month-boundary surprises
  const now = new Date('2026-06-15T08:00:00Z')

  it('daily cron → period is 1 day (86400000 ms)', () => {
    const cron = buildDailyCron('09:00')
    expect(computePeriodMs(cron, 'UTC', now)).toBe(86_400_000)
  })

  it('weekly cron → period is 7 days (604800000 ms)', () => {
    // Monday = 1
    const cron = buildWeeklyCron('09:00', 1)
    expect(computePeriodMs(cron, 'UTC', now)).toBe(7 * 86_400_000)
  })

  it('every-2-days cron → period is 2 days (172800000 ms)', () => {
    const cron = buildCustomEveryNDaysCron('09:00', 2)
    expect(computePeriodMs(cron, 'UTC', now)).toBe(2 * 86_400_000)
  })

  it('every-30-minutes cron → period is 30 minutes (1800000 ms)', () => {
    // buildCustomEveryHMCron with hours=0, minutes=30 produces "*/30 * * * *"
    const cron = buildCustomEveryHMCron(0, 30)
    expect(computePeriodMs(cron, 'UTC', now)).toBe(30 * 60 * 1000)
  })
})

describe('isValidCron', () => {
  it.each([
    '0 9 * * *',
    '0 9 */31 * *',
    '*/59 * * * *',
    '0 */23 * * *',
    '0 9 L * *',
    '30 8 * * 1,3,5',
  ])('accepts %s', (cron) => {
    expect(isValidCron(cron, 'UTC')).toBe(true)
  })

  it.each([
    ['a day-of-month step above 31', '0 9 */32 * *'],
    ['a minute step above 60', '*/90 * * * *'],
    ['an hour step above 24', '0 */36 * * *'],
    ['something that is not a cron', 'every day'],
  ])('rejects %s', (_label, cron) => {
    expect(isValidCron(cron, 'UTC')).toBe(false)
  })
})
