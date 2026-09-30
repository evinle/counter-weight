import { describe, it, expect, vi } from 'vitest'
import { computeLeadTimeVisibility, leadTimeMaxDays } from '../lib/timerForm'
import * as recurrenceMod from '@cw/recurrence'

describe('computeLeadTimeVisibility', () => {
  const DAY_MS = 86_400_000

  it('FromNow mode: uses remainingMs — short remaining hides Days and Hours', () => {
    const result = computeLeadTimeVisibility('from-now', 5 * 60 * 1000, null)
    expect(result).toStrictEqual({ showDays: false, showHours: false, showMinutes: true })
  })

  it('FromNow mode: uses remainingMs — 2-hour remaining shows Hours', () => {
    const result = computeLeadTimeVisibility('from-now', 2 * 60 * 60 * 1000, null)
    expect(result).toStrictEqual({ showDays: false, showHours: true, showMinutes: true })
  })

  it('FromNow mode: uses remainingMs — 2-day remaining shows Days', () => {
    const result = computeLeadTimeVisibility('from-now', 2 * DAY_MS, null)
    expect(result).toStrictEqual({ showDays: true, showHours: true, showMinutes: true })
  })

  it('Recurrence mode with no rule: falls back to remainingMs', () => {
    const result = computeLeadTimeVisibility('recurrence', 5 * 60 * 1000, null)
    expect(result).toStrictEqual({ showDays: false, showHours: false, showMinutes: true })
  })

  it('Recurrence mode with daily rule: uses period (1 day) regardless of short remainingMs', () => {
    vi.spyOn(recurrenceMod, 'computePeriodMs').mockReturnValue(DAY_MS)
    const rule = { cron: '0 9 * * *', tz: 'UTC' } satisfies { cron: string; tz: string }
    // remainingMs is only 3 hours — without period logic, Days would be hidden
    const result = computeLeadTimeVisibility('recurrence', 3 * 60 * 60 * 1000, rule)
    expect(result).toStrictEqual({ showDays: true, showHours: true, showMinutes: true })
    vi.restoreAllMocks()
  })
})

describe('leadTimeMaxDays', () => {
  const NOW = new Date('2026-06-21T09:00:00Z').getTime()
  const inputs = (recurrenceRule: { cron: string; tz: string } | null) => ({
    mode: 'recurrence' as const,
    duration: { days: 0, hours: 0, minutes: 5 },
    atTime: new Date(NOW),
    recurrenceRule,
  })

  it('uses the recurrence period for a valid rule', () => {
    expect(leadTimeMaxDays(inputs({ cron: '0 9 * * *', tz: 'UTC' }), null, NOW)).toBe(1)
  })

  it('does not throw for a saved rule croner cannot schedule', () => {
    expect(() => leadTimeMaxDays(inputs({ cron: '0 9 */45 * *', tz: 'UTC' }), null, NOW)).not.toThrow()
  })

  it('falls back to the widest range when the rule cannot be scheduled', () => {
    expect(leadTimeMaxDays(inputs({ cron: '0 9 */45 * *', tz: 'UTC' }), null, NOW)).toBe(28)
  })
})
