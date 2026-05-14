import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useToastStore } from '../hooks/useToast'

beforeEach(() => {
  useToastStore.setState({ toasts: [] })
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useToastStore', () => {
  it('adds a toast with default fields applied', () => {
    const { show } = useToastStore.getState()
    show({ message: 'hello' })
    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({
      message: 'hello',
      variant: 'default',
      ttl: 4000,
      position: 'bottom',
    })
    expect(typeof toasts[0].id).toBe('string')
  })

  it('overrides defaults with provided fields', () => {
    const { show } = useToastStore.getState()
    show({ message: 'err', variant: 'error', ttl: 0, position: 'top' })
    const toasts = useToastStore.getState().toasts
    expect(toasts[0]).toMatchObject({ variant: 'error', ttl: 0, position: 'top' })
  })

  it('dismiss removes the toast by id', () => {
    const { show, dismiss } = useToastStore.getState()
    show({ message: 'a' })
    const id = useToastStore.getState().toasts[0].id
    dismiss(id)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('auto-dismisses after ttl ms', () => {
    const { show } = useToastStore.getState()
    show({ message: 'auto', ttl: 2000 })
    expect(useToastStore.getState().toasts).toHaveLength(1)
    vi.advanceTimersByTime(2000)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('does not auto-dismiss when ttl is 0', () => {
    const { show } = useToastStore.getState()
    show({ message: 'sticky', ttl: 0 })
    vi.advanceTimersByTime(99999)
    expect(useToastStore.getState().toasts).toHaveLength(1)
  })
})
