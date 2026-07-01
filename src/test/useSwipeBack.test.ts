import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useSwipeBack } from '../hooks/useSwipeBack'

describe('useSwipeBack', () => {
  let pushState: ReturnType<typeof vi.spyOn>
  let back: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    pushState = vi.spyOn(history, 'pushState').mockImplementation(() => {})
    back = vi.spyOn(history, 'back').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('pushes a history entry when isOpen transitions false → true', () => {
    const { rerender } = renderHook(
      ({ isOpen }: { isOpen: boolean }) => useSwipeBack({ isOpen, onClose: vi.fn() }),
      { initialProps: { isOpen: false } },
    )
    rerender({ isOpen: true })
    expect(pushState).toHaveBeenCalledOnce()
  })

  it('does not push on initial mount with isOpen: false', () => {
    renderHook(() => useSwipeBack({ isOpen: false, onClose: vi.fn() }))
    expect(pushState).not.toHaveBeenCalled()
  })

  it('calls onClose when popstate fires while open', () => {
    const onClose = vi.fn()
    renderHook(() => useSwipeBack({ isOpen: true, onClose }))
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')) })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls history.back when isOpen goes false without popstate', () => {
    const { rerender } = renderHook(
      ({ isOpen }: { isOpen: boolean }) => useSwipeBack({ isOpen, onClose: vi.fn() }),
      { initialProps: { isOpen: false } },
    )
    rerender({ isOpen: true })
    rerender({ isOpen: false })
    expect(back).toHaveBeenCalledOnce()
  })

  it('does not call history.back when overlay is closed via popstate', () => {
    const onClose = vi.fn()
    const { rerender } = renderHook(
      ({ isOpen }: { isOpen: boolean }) => useSwipeBack({ isOpen, onClose }),
      { initialProps: { isOpen: false } },
    )
    rerender({ isOpen: true })
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')) })
    // onClose called — isOpen will go false externally next render
    rerender({ isOpen: false })
    expect(back).not.toHaveBeenCalled()
  })

  it('calls history.back on unmount if still open', () => {
    const { unmount } = renderHook(() => useSwipeBack({ isOpen: true, onClose: vi.fn() }))
    unmount()
    expect(back).toHaveBeenCalledOnce()
  })
})
