import { create } from 'zustand'
import type { Timer } from '../db/schema'

interface TimerState {
  firedTimer: Timer | null
  activeTimers: Timer[]
  sync: (activeTimers: Timer[]) => void
  dismissFired: () => void
}

export const useTimerStore = create<TimerState>((set, get) => {
  let timeout: ReturnType<typeof setTimeout> | null = null

  function scheduleNext() {
    if (timeout) clearTimeout(timeout)

    const { activeTimers } = get()
    const now = new Date()
    const next = activeTimers
      .filter((t) => t.targetDatetime > now)
      .sort((a, b) => a.targetDatetime.getTime() - b.targetDatetime.getTime())[0]

    if (!next) return

    timeout = setTimeout(() => {
      set({ firedTimer: next })
      scheduleNext()
    }, Math.max(0, next.targetDatetime.getTime() - Date.now()))
  }

  return {
    firedTimer: null,
    activeTimers: [],
    sync(activeTimers) {
      set({ activeTimers })
      scheduleNext()
    },
    dismissFired() { set({ firedTimer: null }) },
  }
})
