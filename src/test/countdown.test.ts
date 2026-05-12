import { timeRemaining, formatDuration, getHistoryAnnotation, HistoryTiming } from '../lib/countdown'

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

describe('getHistoryAnnotation', () => {
  const target = new Date('2026-01-01T12:00:00Z')
  const original = new Date('2026-01-01T12:00:00Z')
  const created = new Date('2026-01-01T11:00:00Z') // totalDuration = 60 min

  it('returns Early timing when more than 10% of duration remains', () => {
    const updated2 = new Date('2026-01-01T11:53:00Z') // 7 min early = 11.7% → Early
    const { timing } = getHistoryAnnotation(target, updated2, original, created)
    expect(timing).toBe(HistoryTiming.Early)
  })

  it('returns OnTime when within 10% of duration (5 min early on 60 min timer)', () => {
    const updated = new Date('2026-01-01T11:55:00Z') // 5 min early = 8.3% → OnTime
    const { timing } = getHistoryAnnotation(target, updated, original, created)
    expect(timing).toBe(HistoryTiming.OnTime)
  })

  it('returns Overdue timing when updatedAt is after target', () => {
    const updated = new Date('2026-01-01T12:10:00Z') // 10 minutes after
    const { text, timing } = getHistoryAnnotation(target, updated, original, created)
    expect(timing).toBe(HistoryTiming.Overdue)
    expect(text).toBe('00:10:00')
  })

  it('returns OnTime timing when updatedAt equals target exactly', () => {
    const { timing } = getHistoryAnnotation(target, target, original, created)
    expect(timing).toBe(HistoryTiming.OnTime)
  })

  it('returns extensionText when deadline was extended', () => {
    const extendedTarget = new Date('2026-01-01T13:00:00Z') // extended 1h
    const updated = new Date('2026-01-01T12:58:00Z') // 2 min before new target
    const { extensionText } = getHistoryAnnotation(extendedTarget, updated, original, created)
    expect(extensionText).toBe('after 01:00:00 extension')
  })

  it('returns no extensionText when deadline was not extended', () => {
    const updated = new Date('2026-01-01T11:53:00Z')
    const { extensionText } = getHistoryAnnotation(target, updated, original, created)
    expect(extensionText).toBeUndefined()
  })

  it('falls back to diffMs > 0 early check when totalDuration is zero', () => {
    const zeroTarget = new Date('2026-01-01T12:00:00Z')
    const zeroCreated = new Date('2026-01-01T12:00:00Z') // totalDuration = 0
    const updatedEarly = new Date('2026-01-01T11:59:00Z')
    const { timing } = getHistoryAnnotation(zeroTarget, updatedEarly, zeroTarget, zeroCreated)
    expect(timing).toBe(HistoryTiming.Early)
  })
})
