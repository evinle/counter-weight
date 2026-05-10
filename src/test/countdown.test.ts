import { timeRemaining, formatDuration } from '../lib/countdown'

describe('timeRemaining', () => {
  it('returns positive ms when target is in the future', () => {
    const target = new Date(Date.now() + 5000)
    expect(timeRemaining(target)).toBeGreaterThan(0)
  })

  it('returns negative ms when target is in the past', () => {
    const target = new Date(Date.now() - 1000)
    expect(timeRemaining(target)).toBeLessThan(0)
  })
})

describe('formatDuration', () => {
  it('formats seconds only', () => {
    expect(formatDuration(45_000)).toBe('00:00:45')
  })

  it('formats minutes and seconds', () => {
    expect(formatDuration(125_000)).toBe('00:02:05')
  })

  it('formats hours', () => {
    expect(formatDuration(3_661_000)).toBe('01:01:01')
  })

  it('formats days', () => {
    expect(formatDuration(90_061_000)).toBe('1d 01:01:01')
  })

  it('returns 00:00:00 for zero', () => {
    expect(formatDuration(0)).toBe('00:00:00')
  })

  it('formats negative sub-day duration', () => {
    expect(formatDuration(-75_000)).toBe('-00:01:15')
  })

  it('formats negative multi-day duration', () => {
    expect(formatDuration(-90_061_000)).toBe('-1d 01:01:01')
  })
})
