import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { useSwipeToComplete } from '../hooks/useSwipeToComplete'

function makeEl() {
  return document.createElement('div')
}

function fakeTouch(el: Element, x: number, y: number): Touch {
  return { identifier: 1, target: el, clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y, radiusX: 1, radiusY: 1, rotationAngle: 0, force: 1 } as Touch
}

function fireTouch(el: Element, type: string, x: number, y: number) {
  const touch = fakeTouch(el, x, y)
  el.dispatchEvent(new TouchEvent(type, {
    bubbles: true,
    cancelable: true,
    touches: type === 'touchend' ? [] : [touch],
    changedTouches: [touch],
  }))
}

describe('useSwipeToComplete', () => {
  it('tracks dragX when dragging right', () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() => useSwipeToComplete({ onComplete, threshold: 96 }))
    const el = makeEl()
    act(() => { result.current.containerRef(el) })
    act(() => { fireTouch(el, 'touchstart', 0, 0) })
    act(() => { fireTouch(el, 'touchmove', 40, 0) })
    expect(result.current.dragX).toBe(40)
  })

  it('stays 0 when dragging left', () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() => useSwipeToComplete({ onComplete, threshold: 96 }))
    const el = makeEl()
    act(() => { result.current.containerRef(el) })
    act(() => { fireTouch(el, 'touchstart', 100, 0) })
    act(() => { fireTouch(el, 'touchmove', 40, 0) })
    expect(result.current.dragX).toBe(0)
  })

  it('calls onComplete and resets dragX when released past threshold', () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() => useSwipeToComplete({ onComplete, threshold: 96 }))
    const el = makeEl()
    act(() => { result.current.containerRef(el) })
    act(() => { fireTouch(el, 'touchstart', 0, 0) })
    act(() => { fireTouch(el, 'touchmove', 120, 0) })
    act(() => { fireTouch(el, 'touchend', 120, 0) })
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(result.current.dragX).toBe(0)
  })

  it('does not call onComplete and snaps back when released below threshold', () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() => useSwipeToComplete({ onComplete, threshold: 96 }))
    const el = makeEl()
    act(() => { result.current.containerRef(el) })
    act(() => { fireTouch(el, 'touchstart', 0, 0) })
    act(() => { fireTouch(el, 'touchmove', 50, 0) })
    act(() => { fireTouch(el, 'touchend', 50, 0) })
    expect(onComplete).not.toHaveBeenCalled()
    expect(result.current.dragX).toBe(0)
  })

  it('cancels tracking when the drag is mostly vertical', () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() => useSwipeToComplete({ onComplete, threshold: 96 }))
    const el = makeEl()
    act(() => { result.current.containerRef(el) })
    act(() => { fireTouch(el, 'touchstart', 0, 0) })
    act(() => { fireTouch(el, 'touchmove', 50, 200) }) // 50px right, 200px down — vertical wins
    expect(result.current.dragX).toBe(0)
    act(() => { fireTouch(el, 'touchend', 50, 200) })
    expect(onComplete).not.toHaveBeenCalled()
  })
})
