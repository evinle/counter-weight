import { describe, it, expect } from 'vitest'
import { computeNextOccurrence } from './recurrence.js'

describe('computeNextOccurrence', () => {
  it('returns the first occurrence strictly after now for a daily cron', () => {
    // 9am every day; now is 8am UTC — next should be 9am same day UTC
    const rule = { cron: '0 9 * * *', tz: 'UTC' }
    const now = new Date('2026-06-20T08:00:00Z')

    const result = computeNextOccurrence(rule, now)

    expect(result).toEqual(new Date('2026-06-20T09:00:00Z'))
  })

  it('applies the IANA timezone so 9am local is not 9am UTC', () => {
    // Australia/Sydney is UTC+11 in southern-hemisphere summer (AEDT)
    // now is 2026-01-20T00:00:00Z = 11am Sydney time
    // next 9am Sydney is 2026-01-20T22:00:00Z (9am next day Sydney = UTC+11)
    const rule = { cron: '0 9 * * *', tz: 'Australia/Sydney' }
    const now = new Date('2026-01-20T00:00:00Z')

    const result = computeNextOccurrence(rule, now)

    expect(result).toEqual(new Date('2026-01-20T22:00:00Z'))
  })

  it('resolves a cron that falls in Sydney spring-forward gap to the first valid time after the gap', () => {
    // Sydney springs forward Oct 4 2026: 2:00am AEST → 3:00am AEDT (2am–3am doesn't exist)
    // now = 1:30am AEST (2026-10-03T15:30:00Z); next 2:30am AEST doesn't exist
    // croner resolves it to 3:30am AEDT = 2026-10-03T16:30:00Z
    const rule = { cron: '30 2 * * *', tz: 'Australia/Sydney' }
    const now = new Date('2026-10-03T15:30:00Z')

    const result = computeNextOccurrence(rule, now)

    expect(result).toEqual(new Date('2026-10-03T16:30:00Z'))
    expect(result.getTime()).toBeGreaterThan(now.getTime())
  })

  it('skips now when it exactly matches a scheduled time, returning the next one', () => {
    // now is exactly 9am UTC — must not return now itself
    const rule = { cron: '0 9 * * *', tz: 'UTC' }
    const now = new Date('2026-06-20T09:00:00Z')

    const result = computeNextOccurrence(rule, now)

    expect(result).toEqual(new Date('2026-06-21T09:00:00Z'))
  })

  it('returns a future date even when now is several days past the last scheduled time', () => {
    // Weekly cron, Monday 8am UTC; now is a Thursday (several days past the last Monday)
    const rule = { cron: '0 8 * * 1', tz: 'UTC' }
    const now = new Date('2026-06-18T12:00:00Z') // Thursday noon

    const result = computeNextOccurrence(rule, now)

    // Next Monday 8am UTC
    expect(result).toEqual(new Date('2026-06-22T08:00:00Z'))
    expect(result.getTime()).toBeGreaterThan(now.getTime())
  })
})
