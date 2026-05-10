import { useAnimatedCountdown } from '../hooks/useAnimatedCountdown'
import { formatDuration } from '../lib/countdown'
import { completeTimer } from '../hooks/useTimers'
import type { Timer } from '../db/schema'

const PRIORITY_COLOURS: Record<string, string> = {
  low: 'text-slate-400',
  medium: 'text-blue-400',
  high: 'text-amber-400',
  critical: 'text-red-500',
}

interface Props {
  timer: Timer
  onEdit: (timer: Timer) => void
}

export function TimerCard({ timer, onEdit }: Props) {
  const remaining = useAnimatedCountdown(timer.targetDatetime)
  const isExpired = remaining === 0

  return (
    <div className={`rounded-xl p-4 bg-slate-800 flex flex-col gap-1 ${isExpired ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-base font-medium text-white truncate">
          {timer.emoji && <span className="mr-2">{timer.emoji}</span>}
          {timer.title}
        </span>
        <span className={`text-xs font-semibold uppercase ml-2 shrink-0 ${PRIORITY_COLOURS[timer.priority]}`}>
          {timer.priority}
        </span>
      </div>

      <span className="text-3xl font-mono text-white tabular-nums tracking-tight">
        {formatDuration(remaining)}
      </span>

      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={() => completeTimer(timer.id!)}
          className="text-xs px-3 py-1 rounded-full bg-green-700 text-white"
        >
          Done
        </button>
        <button
          onClick={() => onEdit(timer)}
          className="text-xs px-3 py-1 rounded-full bg-slate-600 text-white"
        >
          Edit
        </button>
        {timer.isFlagged && <span className="text-amber-400 text-sm ml-auto">⚑</span>}
      </div>
    </div>
  )
}
