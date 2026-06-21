import { describe, it, expect } from 'vitest'
import { nextOccurrence } from '@cw/recurrence'

describe('nextOccurrence', () => {
  it('returns the first occurrence strictly after now for a daily cron', () => {
    const now = new Date('2026-06-20T08:00:00Z')
    const result = nextOccurrence('0 9 * * *', 'UTC', now)
    expect(result).toEqual(new Date('2026-06-20T09:00:00Z'))
  })

  it('applies the IANA timezone so 9am local is not 9am UTC', () => {
    // Australia/Sydney is UTC+11 in southern-hemisphere summer (AEDT)
    // now is 2026-01-20T00:00:00Z = 11am Sydney time
    // next 9am Sydney is 2026-01-20T22:00:00Z
    const now = new Date('2026-01-20T00:00:00Z')
    const result = nextOccurrence('0 9 * * *', 'Australia/Sydney', now)
    expect(result).toEqual(new Date('2026-01-20T22:00:00Z'))
  })

  it('resolves a cron that falls in Sydney spring-forward gap to the first valid time after the gap', () => {
    // Sydney springs forward Oct 4 2026: 2:00am AEST → 3:00am AEDT
    const now = new Date('2026-10-03T15:30:00Z')
    const result = nextOccurrence('30 2 * * *', 'Australia/Sydney', now)
    expect(result).toEqual(new Date('2026-10-03T16:30:00Z'))
    expect(result.getTime()).toBeGreaterThan(now.getTime())
  })

  it('skips now when it exactly matches a scheduled time, returning the next one', () => {
    const now = new Date('2026-06-20T09:00:00Z')
    const result = nextOccurrence('0 9 * * *', 'UTC', now)
    expect(result).toEqual(new Date('2026-06-21T09:00:00Z'))
  })

  it('returns a future date even when now is several days past the last scheduled time', () => {
    const now = new Date('2026-06-18T12:00:00Z') // Thursday noon
    const result = nextOccurrence('0 8 * * 1', 'UTC', now)
    expect(result).toEqual(new Date('2026-06-22T08:00:00Z'))
    expect(result.getTime()).toBeGreaterThan(now.getTime())
  })
})
