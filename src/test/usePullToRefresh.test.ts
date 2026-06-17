import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { usePullToRefresh } from '../hooks/usePullToRefresh'

function fakeTouch(el: Element, y: number): Touch {
  return { identifier: 1, target: el, clientY: y, clientX: 0, pageX: 0, pageY: y, screenX: 0, screenY: y, radiusX: 1, radiusY: 1, rotationAngle: 0, force: 1 } as Touch
}

function fireTouch(el: Element, type: string, y: number) {
  const touch = fakeTouch(el, y)
  el.dispatchEvent(new TouchEvent(type, {
    bubbles: true,
    cancelable: true,
    touches: type === 'touchend' ? [] : [touch],
    changedTouches: [touch],
  }))
}

function makeEl() {
  const el = document.createElement('div')
  Object.defineProperty(el, 'scrollTop', { value: 0, writable: true })
  return el
}

describe('usePullToRefresh', () => {
  it('pullDistance is 0 initially', () => {
    const { result } = renderHook(() => usePullToRefresh({ onRefresh: null }))
    expect(result.current.pullDistance).toBe(0)
  })

  it('stays 0 during drag when onRefresh is null', () => {
    const { result } = renderHook(() => usePullToRefresh({ onRefresh: null }))
    const el = makeEl()
    act(() => { result.current.containerRef(el) })
    act(() => { fireTouch(el, 'touchstart', 100) })
    act(() => { fireTouch(el, 'touchmove', 160) })
    expect(result.current.pullDistance).toBe(0)
  })

  it('tracks pullDistance when dragging down from scrollTop 0', () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }))
    const el = makeEl()
    act(() => { result.current.containerRef(el) })
    act(() => { fireTouch(el, 'touchstart', 100) })
    act(() => { fireTouch(el, 'touchmove', 140) })
    expect(result.current.pullDistance).toBe(40)
  })

  it('stays 0 when drag starts at scrollTop > 0', () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }))
    const el = makeEl()
    ;(el as unknown as { scrollTop: number }).scrollTop = 50
    act(() => { result.current.containerRef(el) })
    act(() => { fireTouch(el, 'touchstart', 100) })
    act(() => { fireTouch(el, 'touchmove', 160) })
    expect(result.current.pullDistance).toBe(0)
  })

  it('calls onRefresh when released past threshold', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => usePullToRefresh({ onRefresh, threshold: 70 }))
    const el = makeEl()
    act(() => { result.current.containerRef(el) })
    act(() => { fireTouch(el, 'touchstart', 0) })
    act(() => { fireTouch(el, 'touchmove', 80) })
    await act(async () => { fireTouch(el, 'touchend', 80) })
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('does not fire a second onRefresh while first is still in flight', async () => {
    let resolveFirst!: () => void
    const firstCall = new Promise<void>((res) => { resolveFirst = res })
    const onRefresh = vi.fn().mockReturnValueOnce(firstCall).mockResolvedValue(undefined)
    const { result } = renderHook(() => usePullToRefresh({ onRefresh, threshold: 70 }))
    const el = makeEl()
    act(() => { result.current.containerRef(el) })

    act(() => { fireTouch(el, 'touchstart', 0) })
    act(() => { fireTouch(el, 'touchmove', 80) })
    await act(async () => { fireTouch(el, 'touchend', 80) })

    act(() => { fireTouch(el, 'touchstart', 0) })
    act(() => { fireTouch(el, 'touchmove', 80) })
    await act(async () => { fireTouch(el, 'touchend', 80) })

    expect(onRefresh).toHaveBeenCalledTimes(1)
    resolveFirst()
  })

  it('does not call onRefresh when released before threshold', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => usePullToRefresh({ onRefresh, threshold: 70 }))
    const el = makeEl()
    act(() => { result.current.containerRef(el) })
    act(() => { fireTouch(el, 'touchstart', 0) })
    act(() => { fireTouch(el, 'touchmove', 40) })
    await act(async () => { fireTouch(el, 'touchend', 40) })
    expect(onRefresh).not.toHaveBeenCalled()
  })
})
