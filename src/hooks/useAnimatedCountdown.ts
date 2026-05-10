import { useState, useEffect } from 'react'
import { timeRemaining } from '../lib/countdown'

export function useAnimatedCountdown(targetDatetime: Date): number {
  const [remaining, setRemaining] = useState(() => timeRemaining(targetDatetime))

  useEffect(() => {
    let rafId: number

    const tick = () => {
      setRemaining(timeRemaining(targetDatetime))
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [targetDatetime])

  return remaining
}
