import { useState, useEffect } from 'react'
import { effortElapsed } from '../lib/countdown'
import type { WorkSession } from '../db/schema'

export function useAnimatedElapsed(sessions: WorkSession[]): number {
  const [elapsed, setElapsed] = useState(() => effortElapsed(sessions, new Date()))

  useEffect(() => {
    let rafId: number

    const tick = () => {
      setElapsed(effortElapsed(sessions, new Date()))
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [sessions])

  return elapsed
}
