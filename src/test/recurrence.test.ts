import { describe, it, expect } from 'vitest'
import {
  buildDailyCron,
  buildWeekdayCron,
  buildWeeklyCron,
  buildMonthlyCron,
  buildCustomWeeklyCron,
  buildCustomEveryNDaysCron,
  buildCustomEveryNHoursCron,
  buildCustomEveryNMinutesCron,
} from '../lib/recurrence'

describe('buildDailyCron', () => {
  it('produces correct cron for a given time', () => {
    expect(buildDailyCron('09:00')).toBe('0 9 * * *')
    expect(buildDailyCron('14:30')).toBe('30 14 * * *')
  })
})

describe('buildWeekdayCron', () => {
  it('produces Mon–Fri cron for a given time', () => {
    expect(buildWeekdayCron('09:00')).toBe('0 9 * * 1-5')
    expect(buildWeekdayCron('08:15')).toBe('15 8 * * 1-5')
  })
})

describe('buildWeeklyCron', () => {
  it('uses the supplied day-of-week (0=Sun)', () => {
    expect(buildWeeklyCron('09:00', 3)).toBe('0 9 * * 3')
    expect(buildWeeklyCron('18:45', 5)).toBe('45 18 * * 5')
  })
})

describe('buildMonthlyCron', () => {
  it('uses the supplied day-of-month', () => {
    expect(buildMonthlyCron('09:00', 15)).toBe('0 9 15 * *')
    expect(buildMonthlyCron('08:00', 1)).toBe('0 8 1 * *')
  })
})

describe('buildCustomWeeklyCron', () => {
  it('produces comma-separated sorted days', () => {
    expect(buildCustomWeeklyCron('09:30', [1, 3, 5])).toBe('30 9 * * 1,3,5')
    expect(buildCustomWeeklyCron('09:30', [5, 1, 3])).toBe('30 9 * * 1,3,5')
  })

  it('handles a single day', () => {
    expect(buildCustomWeeklyCron('10:00', [2])).toBe('0 10 * * 2')
  })
})

describe('buildCustomEveryNDaysCron', () => {
  it('produces */N day-of-month cron', () => {
    expect(buildCustomEveryNDaysCron('07:00', 3)).toBe('0 7 */3 * *')
    expect(buildCustomEveryNDaysCron('12:30', 7)).toBe('30 12 */7 * *')
  })
})

describe('buildCustomEveryNHoursCron', () => {
  it('produces */N hour cron with 0 minutes', () => {
    expect(buildCustomEveryNHoursCron(2)).toBe('0 */2 * * *')
    expect(buildCustomEveryNHoursCron(6)).toBe('0 */6 * * *')
  })
})

describe('buildCustomEveryNMinutesCron', () => {
  it('produces */N minute cron', () => {
    expect(buildCustomEveryNMinutesCron(30)).toBe('*/30 * * * *')
    expect(buildCustomEveryNMinutesCron(15)).toBe('*/15 * * * *')
  })
})
