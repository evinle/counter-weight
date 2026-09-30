import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { useSwipeToComplete } from '../hooks/useSwipeToComplete'

const WIDTH = 300

function makeEl() {
  const el = document.createElement('div')
  el.getBoundingClientRect = () => new DOMRect(0, 0, WIDTH, 100)
  return el
}

function drag(el: Element, fromX: number, toX: number, toY = 0) {
  const init = { pointerId: 1, pointerType: 'mouse', button: 0 }
  act(() => { el.dispatchEvent(new PointerEvent('pointerdown', { ...init, clientX: fromX, clientY: 0, bubbles: true })) })
  act(() => { window.dispatchEvent(new PointerEvent('pointermove', { ...init, clientX: toX, clientY: toY })) })
  act(() => { window.dispatchEvent(new PointerEvent('pointerup', { ...init, clientX: toX, clientY: toY })) })
}

function setup(options: { threshold?: number } = {}) {
  const onComplete = vi.fn()
  const { result } = renderHook(() => useSwipeToComplete({ onComplete, ...options }))
  const el = makeEl()
  act(() => { result.current.containerRef(el) })
  return { onComplete, el }
}

describe('useSwipeToComplete threshold', () => {
  it('completes at exactly 70% of the width by default', () => {
    const { onComplete, el } = setup()

    drag(el, 0, 210)

    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('does not complete just under 70% of the width by default', () => {
    const { onComplete, el } = setup()

    drag(el, 0, 209)

    expect(onComplete).not.toHaveBeenCalled()
  })

  it('uses the threshold passed in as a fraction of width', () => {
    const { onComplete, el } = setup({ threshold: 0.3 })

    drag(el, 0, 90)

    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('does not complete on a mostly vertical drag', () => {
    const { onComplete, el } = setup()

    drag(el, 0, 250, 400)

    expect(onComplete).not.toHaveBeenCalled()
  })

  it('ignores a non-primary mouse button', () => {
    const { onComplete, el } = setup()
    const init = { pointerId: 1, pointerType: 'mouse', button: 2 }

    act(() => { el.dispatchEvent(new PointerEvent('pointerdown', { ...init, clientX: 0, clientY: 0, bubbles: true })) })
    act(() => { window.dispatchEvent(new PointerEvent('pointerup', { ...init, clientX: 250, clientY: 0 })) })

    expect(onComplete).not.toHaveBeenCalled()
  })
})

describe('useSwipeToComplete arm threshold', () => {
  function setupArm(options: { armThreshold?: number } = {}) {
    const { result } = renderHook(() => useSwipeToComplete({ onComplete: vi.fn(), ...options }))
    const el = makeEl()
    act(() => { result.current.containerRef(el) })
    return { result, el }
  }

  it('arms at exactly 40% of the width by default', () => {
    const { result, el } = setupArm()

    drag(el, 200, 80)

    expect(result.current.armed).toBe(true)
  })

  it('does not arm just under 40% of the width by default', () => {
    const { result, el } = setupArm()

    drag(el, 200, 81)

    expect(result.current.armed).toBe(false)
  })

  it('uses the arm threshold passed in as a fraction of width', () => {
    const { result, el } = setupArm({ armThreshold: 0.2 })

    drag(el, 200, 140)

    expect(result.current.armed).toBe(true)
  })

  it('lets the drag travel past the old 96px reveal width', () => {
    const { result, el } = setupArm()
    const init = { pointerId: 1, pointerType: 'mouse', button: 0 }
    act(() => { el.dispatchEvent(new PointerEvent('pointerdown', { ...init, clientX: 250, clientY: 0, bubbles: true })) })
    act(() => { window.dispatchEvent(new PointerEvent('pointermove', { ...init, clientX: 100, clientY: 0 })) })

    expect(result.current.dragX).toBe(-150)
  })
})
