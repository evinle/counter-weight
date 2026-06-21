import { describe, it, expect } from 'vitest'
import { nextOccurrence } from './index.ts'

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
