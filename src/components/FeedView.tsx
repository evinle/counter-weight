import { useFeedTimers } from '../hooks/useTimers'
import { TimerCard } from './TimerCard'
import type { Timer } from '../db/schema'

interface Props {
  onEdit: (timer: Timer) => void
}

export function FeedView({ onEdit }: Props) {
  const timers = useFeedTimers()

  if (timers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500">
        <span className="text-5xl mb-3">⏳</span>
        <p className="text-sm">No active timers. Create one to get started.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {timers.map((timer) => (
        <TimerCard key={timer.id} timer={timer} onEdit={onEdit} />
      ))}
    </div>
  )
}
