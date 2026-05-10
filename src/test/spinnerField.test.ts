import { applyBounds } from '../components/SpinnerField'

describe('applyBounds — wrap mode', () => {
  it('wraps above max', () => {
    expect(applyBounds(60, 0, 59, false)).toBe(0)
  })

  it('wraps below min', () => {
    expect(applyBounds(-1, 0, 59, false)).toBe(59)
  })

  it('wraps multiple steps above max', () => {
    expect(applyBounds(62, 0, 59, false)).toBe(2)
  })

  it('returns value within range unchanged', () => {
    expect(applyBounds(30, 0, 59, false)).toBe(30)
  })

  it('wraps non-zero min range', () => {
    expect(applyBounds(13, 1, 12, false)).toBe(1)
    expect(applyBounds(0, 1, 12, false)).toBe(12)
  })
})

describe('applyBounds — clamp mode', () => {
  it('clamps above max', () => {
    expect(applyBounds(100, 0, 10, true)).toBe(10)
  })

  it('clamps below min', () => {
    expect(applyBounds(-5, 0, 10, true)).toBe(0)
  })

  it('returns value within range unchanged', () => {
    expect(applyBounds(5, 0, 10, true)).toBe(5)
  })
})
