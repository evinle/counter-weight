import { create } from 'zustand'
import type { Timer } from '../db/schema'

interface TimerState {
  firedTimer: Timer | null
  sync: (activeTimers: Timer[]) => void
  dismissFired: () => void
}

export const useTimerStore = create<TimerState>((set, get) => {
  let timeout: ReturnType<typeof setTimeout> | null = null

  function scheduleNext(timers: Timer[]) {
    if (timeout) clearTimeout(timeout)

    const next = timers
      .filter((t) => t.targetDatetime > new Date())
      .sort((a, b) => a.targetDatetime.getTime() - b.targetDatetime.getTime())[0]

    if (!next) return

    timeout = setTimeout(() => {
      set({ firedTimer: next })
      scheduleNext(timers.filter((t) => t.id !== next.id))
    }, next.targetDatetime.getTime() - Date.now())
  }

  return {
    firedTimer: null,
    sync(activeTimers) { scheduleNext(activeTimers) },
    dismissFired() { set({ firedTimer: null }) },
  }
})
