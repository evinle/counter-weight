import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest'
import { useTimerStore } from '../store/timerStore'
import type { Timer } from '../db/schema'

function makeTimer(overrides: Partial<Timer> = {}): Timer {
  return {
    id: 1,
    title: 'Test',
    description: null,
    emoji: null,
    targetDatetime: new Date(Date.now() + 5000),
    status: 'active',
    priority: 'medium',
    isFlagged: false,
    groupId: null,
    recurrenceRule: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('timerStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useTimerStore.setState({ firedTimer: null })
  })
  afterEach(() => { vi.useRealTimers() })

  it('sets firedTimer when a timer fires', () => {
    const timer = makeTimer({ id: 1, targetDatetime: new Date(Date.now() + 1000) })
    useTimerStore.getState().sync([timer])
    vi.advanceTimersByTime(1001)
    expect(useTimerStore.getState().firedTimer).toEqual(timer)
  })

  it('does not fire a timer removed before it was due', () => {
    const timer = makeTimer({ id: 1, targetDatetime: new Date(Date.now() + 1000) })
    useTimerStore.getState().sync([timer])
    useTimerStore.getState().sync([]) // removed before firing
    vi.advanceTimersByTime(2000)
    expect(useTimerStore.getState().firedTimer).toBeNull()
  })

  it('reschedules when a sooner timer is added', () => {
    const later = makeTimer({ id: 1, targetDatetime: new Date(Date.now() + 5000) })
    const sooner = makeTimer({ id: 2, targetDatetime: new Date(Date.now() + 1000) })
    useTimerStore.getState().sync([later])
    useTimerStore.getState().sync([later, sooner])
    vi.advanceTimersByTime(1001)
    expect(useTimerStore.getState().firedTimer?.id).toBe(2)
  })

  it('fires multiple timers in order', () => {
    const fired: number[] = []
    const unsub = useTimerStore.subscribe((state) => {
      if (state.firedTimer) fired.push(state.firedTimer.id!)
    })
    const first = makeTimer({ id: 1, targetDatetime: new Date(Date.now() + 1000) })
    const second = makeTimer({ id: 2, targetDatetime: new Date(Date.now() + 2000) })
    useTimerStore.getState().sync([first, second])
    vi.advanceTimersByTime(1001)
    expect(fired).toEqual([1])
    vi.advanceTimersByTime(1000)
    expect(fired).toEqual([1, 2])
    unsub()
  })

  it('dismissFired clears firedTimer', () => {
    const timer = makeTimer({ id: 1, targetDatetime: new Date(Date.now() + 100) })
    useTimerStore.getState().sync([timer])
    vi.advanceTimersByTime(101)
    useTimerStore.getState().dismissFired()
    expect(useTimerStore.getState().firedTimer).toBeNull()
  })

  it('fires immediately for past timers', () => {
    const past = makeTimer({ id: 1, targetDatetime: new Date(Date.now() - 1000) })
    useTimerStore.getState().sync([past])
    vi.advanceTimersByTime(1)
    expect(useTimerStore.getState().firedTimer?.id).toBe(1)
  })
})
