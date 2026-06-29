import { describe, it, expect } from 'vitest'
import { angleToHour, angleToMinute, pointToAngle, to12h, to24h } from '../components/clockMath'

describe('angleToHour', () => {
  it('0° maps to 12', () => expect(angleToHour(0)).toBe(12))
  it('30° maps to 1', () => expect(angleToHour(30)).toBe(1))
  it('90° maps to 3', () => expect(angleToHour(90)).toBe(3))
  it('180° maps to 6', () => expect(angleToHour(180)).toBe(6))
  it('270° maps to 9', () => expect(angleToHour(270)).toBe(9))
  it('330° maps to 11', () => expect(angleToHour(330)).toBe(11))
  it('360° wraps to 12', () => expect(angleToHour(360)).toBe(12))
  it('negative angle normalises correctly', () => expect(angleToHour(-30)).toBe(11))
})

describe('angleToMinute', () => {
  it('0° maps to 0', () => expect(angleToMinute(0)).toBe(0))
  it('90° maps to 15', () => expect(angleToMinute(90)).toBe(15))
  it('180° maps to 30', () => expect(angleToMinute(180)).toBe(30))
  it('354° maps to 59', () => expect(angleToMinute(354)).toBe(59))
  it('360° wraps to 0', () => expect(angleToMinute(360)).toBe(0))
})

describe('pointToAngle', () => {
  // center at (100, 100)
  it('point directly above center → 0°', () => {
    expect(pointToAngle(100, 50, 100, 100)).toBeCloseTo(0)
  })
  it('point directly right of center → 90°', () => {
    expect(pointToAngle(150, 100, 100, 100)).toBeCloseTo(90)
  })
  it('point directly below center → 180°', () => {
    expect(pointToAngle(100, 150, 100, 100)).toBeCloseTo(180)
  })
  it('point directly left of center → 270°', () => {
    expect(pointToAngle(50, 100, 100, 100)).toBeCloseTo(270)
  })
})

describe('to12h', () => {
  it('midnight (0h) → 12 AM', () => {
    expect(to12h(new Date(2026, 0, 1, 0, 30))).toStrictEqual({ hour: 12, minute: 30, isPm: false })
  })
  it('1 AM → 1 AM', () => {
    expect(to12h(new Date(2026, 0, 1, 1, 0))).toStrictEqual({ hour: 1, minute: 0, isPm: false })
  })
  it('11 AM → 11 AM', () => {
    expect(to12h(new Date(2026, 0, 1, 11, 45))).toStrictEqual({ hour: 11, minute: 45, isPm: false })
  })
  it('noon (12h) → 12 PM', () => {
    expect(to12h(new Date(2026, 0, 1, 12, 0))).toStrictEqual({ hour: 12, minute: 0, isPm: true })
  })
  it('13h → 1 PM', () => {
    expect(to12h(new Date(2026, 0, 1, 13, 15))).toStrictEqual({ hour: 1, minute: 15, isPm: true })
  })
  it('23h → 11 PM', () => {
    expect(to12h(new Date(2026, 0, 1, 23, 59))).toStrictEqual({ hour: 11, minute: 59, isPm: true })
  })
})

describe('to24h', () => {
  it('12 AM → 0h (midnight)', () => {
    expect(to24h(12, 0, false)).toStrictEqual({ hour: 0, minute: 0 })
  })
  it('1 AM → 1h', () => {
    expect(to24h(1, 30, false)).toStrictEqual({ hour: 1, minute: 30 })
  })
  it('11 AM → 11h', () => {
    expect(to24h(11, 0, false)).toStrictEqual({ hour: 11, minute: 0 })
  })
  it('12 PM → 12h (noon)', () => {
    expect(to24h(12, 0, true)).toStrictEqual({ hour: 12, minute: 0 })
  })
  it('1 PM → 13h', () => {
    expect(to24h(1, 15, true)).toStrictEqual({ hour: 13, minute: 15 })
  })
  it('11 PM → 23h', () => {
    expect(to24h(11, 59, true)).toStrictEqual({ hour: 23, minute: 59 })
  })
})
