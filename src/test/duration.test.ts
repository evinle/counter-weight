import { durationToMs, msToDuration } from '../lib/duration'

describe('durationToMs', () => {
  it('converts days hours minutes seconds to ms', () => {
    expect(durationToMs(1, 2, 30, 15)).toBe((86400 + 7200 + 1800 + 15) * 1000)
  })

  it('returns 0 for all zeros', () => {
    expect(durationToMs(0, 0, 0, 0)).toBe(0)
  })

  it('handles seconds only', () => {
    expect(durationToMs(0, 0, 0, 30)).toBe(30_000)
  })

  it('handles minutes only', () => {
    expect(durationToMs(0, 0, 5, 0)).toBe(300_000)
  })
})

describe('msToDuration', () => {
  it('converts ms to days hours minutes seconds', () => {
    expect(msToDuration((86400 + 7200 + 1800 + 15) * 1000)).toEqual({
      days: 1, hours: 2, minutes: 30, seconds: 15,
    })
  })

  it('returns zeros for 0 ms', () => {
    expect(msToDuration(0)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 })
  })

  it('truncates sub-second ms', () => {
    expect(msToDuration(1500)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 1 })
  })

  it('round-trips through durationToMs', () => {
    const original = { days: 2, hours: 3, minutes: 45, seconds: 20 }
    expect(
      msToDuration(durationToMs(original.days, original.hours, original.minutes, original.seconds))
    ).toEqual(original)
  })
})
