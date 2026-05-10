import { durationToMs, msToDuration } from '../lib/duration'

describe('durationToMs', () => {
  it('converts days hours minutes to ms', () => {
    expect(durationToMs(1, 2, 30)).toBe((86400 + 7200 + 1800) * 1000)
  })

  it('returns 0 for all zeros', () => {
    expect(durationToMs(0, 0, 0)).toBe(0)
  })

  it('handles minutes only', () => {
    expect(durationToMs(0, 0, 5)).toBe(300_000)
  })
})

describe('msToDuration', () => {
  it('converts ms to days hours minutes', () => {
    expect(msToDuration((86400 + 7200 + 1800) * 1000)).toEqual({ days: 1, hours: 2, minutes: 30 })
  })

  it('returns zeros for 0 ms', () => {
    expect(msToDuration(0)).toEqual({ days: 0, hours: 0, minutes: 0 })
  })

  it('truncates sub-minute ms', () => {
    expect(msToDuration(90_500)).toEqual({ days: 0, hours: 0, minutes: 1 })
  })

  it('round-trips through durationToMs', () => {
    const original = { days: 2, hours: 3, minutes: 45 }
    expect(msToDuration(durationToMs(original.days, original.hours, original.minutes))).toEqual(original)
  })
})
