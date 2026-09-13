import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useTabSwipe } from '../hooks/useTabSwipe'
import { Tab, ALL_TABS } from '../lib/navigation'

function makeEl() {
  const el = document.createElement('div')
  Object.defineProperty(el, 'scrollTop', { value: 0, writable: true })
  return el
}

function fakeTouch(el: Element, x: number, y: number): Touch {
  return { identifier: 1, target: el, clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y, radiusX: 1, radiusY: 1, rotationAngle: 0, force: 1 } as Touch
}

function swipe(el: Element, startX: number, endX: number, startY = 200, endY = 200) {
  const startTouch = fakeTouch(el, startX, startY)
  const endTouch = fakeTouch(el, endX, endY)
  el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [startTouch], changedTouches: [startTouch] }))
  el.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [endTouch], changedTouches: [endTouch] }))
  el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [endTouch] }))
}

describe('useTabSwipe', () => {
  let onTabChange: ReturnType<typeof vi.fn<(tab: string) => void>>
  let el: HTMLElement

  beforeEach(() => {
    onTabChange = vi.fn<(tab: string) => void>()
    el = makeEl()
  })

  it('swipe left past threshold advances to next tab', () => {
    const { result } = renderHook(() =>
      useTabSwipe({ tabs: ALL_TABS, activeTab: Tab.Timers, onTabChange, threshold: 70 })
    )
    act(() => { result.current.containerRef(el) })
    act(() => { swipe(el, 200, 120) }) // 80px left
    expect(onTabChange).toHaveBeenCalledWith(Tab.History)
  })

  it('swipe right past threshold goes to previous tab', () => {
    const { result } = renderHook(() =>
      useTabSwipe({ tabs: ALL_TABS, activeTab: Tab.History, onTabChange, threshold: 70 })
    )
    act(() => { result.current.containerRef(el) })
    act(() => { swipe(el, 120, 200) }) // 80px right
    expect(onTabChange).toHaveBeenCalledWith(Tab.Timers)
  })

  it('does not fire when swipe is shorter than threshold', () => {
    const { result } = renderHook(() =>
      useTabSwipe({ tabs: ALL_TABS, activeTab: Tab.Timers, onTabChange, threshold: 70 })
    )
    act(() => { result.current.containerRef(el) })
    act(() => { swipe(el, 200, 150) }) // 50px left — under threshold
    expect(onTabChange).not.toHaveBeenCalled()
  })

  it('does not fire when swipe is mostly vertical', () => {
    const { result } = renderHook(() =>
      useTabSwipe({ tabs: ALL_TABS, activeTab: Tab.Timers, onTabChange, threshold: 70 })
    )
    act(() => { result.current.containerRef(el) })
    act(() => { swipe(el, 200, 120, 200, 400) }) // 80px left, 200px down — vertical wins
    expect(onTabChange).not.toHaveBeenCalled()
  })

  it('does not advance past the last tab on swipe left', () => {
    const { result } = renderHook(() =>
      useTabSwipe({ tabs: ALL_TABS, activeTab: Tab.Settings, onTabChange, threshold: 70 })
    )
    act(() => { result.current.containerRef(el) })
    act(() => { swipe(el, 200, 120) })
    expect(onTabChange).not.toHaveBeenCalled()
  })

  it('does not go before the first tab on swipe right', () => {
    const { result } = renderHook(() =>
      useTabSwipe({ tabs: ALL_TABS, activeTab: Tab.Timers, onTabChange, threshold: 70 })
    )
    act(() => { result.current.containerRef(el) })
    act(() => { swipe(el, 120, 200) })
    expect(onTabChange).not.toHaveBeenCalled()
  })

  it('does not fire when disabled, even past threshold', () => {
    const { result } = renderHook(() =>
      useTabSwipe({ tabs: ALL_TABS, activeTab: Tab.Timers, onTabChange, threshold: 70, enabled: false })
    )
    act(() => { result.current.containerRef(el) })
    act(() => { swipe(el, 200, 120) })
    expect(onTabChange).not.toHaveBeenCalled()
  })

  it('does not fire when the swipe starts inside a horizontally-scrollable descendant (e.g. the emoji picker)', () => {
    const { result } = renderHook(() =>
      useTabSwipe({ tabs: ALL_TABS, activeTab: Tab.Timers, onTabChange, threshold: 70 })
    )
    act(() => { result.current.containerRef(el) })

    const picker = document.createElement('div')
    picker.style.overflowX = 'auto'
    Object.defineProperty(picker, 'scrollWidth', { value: 500 })
    Object.defineProperty(picker, 'clientWidth', { value: 200 })
    const emoji = document.createElement('span')
    picker.appendChild(emoji)
    el.appendChild(picker)

    act(() => { swipe(emoji, 200, 120) })
    expect(onTabChange).not.toHaveBeenCalled()
  })

  it('exposes dragDirection and dragDistance while dragging left with a next tab available', () => {
    const { result } = renderHook(() =>
      useTabSwipe({ tabs: ALL_TABS, activeTab: Tab.Timers, onTabChange, threshold: 70 })
    )
    act(() => { result.current.containerRef(el) })
    act(() => { fireTouch(el, 'touchstart', 200, 200) })
    act(() => { fireTouch(el, 'touchmove', 160, 200) }) // 40px left

    expect(result.current.dragDirection).toBe('next')
    expect(result.current.dragDistance).toBe(40)
  })

  it('does not expose a direction when dragging left on the last tab (no next)', () => {
    const { result } = renderHook(() =>
      useTabSwipe({ tabs: ALL_TABS, activeTab: Tab.Settings, onTabChange, threshold: 70 })
    )
    act(() => { result.current.containerRef(el) })
    act(() => { fireTouch(el, 'touchstart', 200, 200) })
    act(() => { fireTouch(el, 'touchmove', 160, 200) })

    expect(result.current.dragDirection).toBeNull()
    expect(result.current.dragDistance).toBe(0)
  })

  it('does not expose a direction when dragging right on the first tab (no prev)', () => {
    const { result } = renderHook(() =>
      useTabSwipe({ tabs: ALL_TABS, activeTab: Tab.Timers, onTabChange, threshold: 70 })
    )
    act(() => { result.current.containerRef(el) })
    act(() => { fireTouch(el, 'touchstart', 160, 200) })
    act(() => { fireTouch(el, 'touchmove', 200, 200) })

    expect(result.current.dragDirection).toBeNull()
    expect(result.current.dragDistance).toBe(0)
  })

  it('resets dragDirection and dragDistance to null/0 when released before threshold', () => {
    const { result } = renderHook(() =>
      useTabSwipe({ tabs: ALL_TABS, activeTab: Tab.Timers, onTabChange, threshold: 70 })
    )
    act(() => { result.current.containerRef(el) })
    act(() => { fireTouch(el, 'touchstart', 200, 200) })
    act(() => { fireTouch(el, 'touchmove', 160, 200) })
    expect(result.current.dragDirection).toBe('next')

    act(() => { fireTouch(el, 'touchend', 160, 200) })

    expect(result.current.dragDirection).toBeNull()
    expect(result.current.dragDistance).toBe(0)
    expect(onTabChange).not.toHaveBeenCalled()
  })
})

function fireTouch(el: Element, type: string, x: number, y: number) {
  const touch = fakeTouch(el, x, y)
  el.dispatchEvent(new TouchEvent(type, {
    bubbles: true,
    cancelable: true,
    touches: type === 'touchend' ? [] : [touch],
    changedTouches: [touch],
  }))
}
