import { useAnimatedCountdown } from '../hooks/useAnimatedCountdown'
import { formatDuration } from '../lib/countdown'
import { completeTimer } from '../hooks/useTimers'
import type { Timer, Priority } from '../db/schema'

const PRIORITY_COLOURS: Record<Priority, string> = {
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
    <div className={`rounded-xl p-4 bg-slate-800 flex flex-col gap-2 ${isExpired ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-lg font-medium text-white truncate">
          {timer.emoji && <span className="mr-2">{timer.emoji}</span>}
          {timer.title}
        </span>
        <span className={`text-sm font-semibold uppercase shrink-0 ${PRIORITY_COLOURS[timer.priority]}`}>
          {timer.priority}
        </span>
      </div>

      <span className="text-4xl font-mono text-white tabular-nums tracking-tight">
        {formatDuration(remaining)}
      </span>

      <div className="flex items-center gap-3 mt-1">
        <button
          onClick={() => { if (timer.id !== undefined) completeTimer(timer.id) }}
          className="flex-1 py-3 rounded-xl bg-green-700 text-white text-base font-medium min-h-[48px] hover:bg-green-600 active:scale-95 transition-all"
        >
          Done
        </button>
        <button
          onClick={() => onEdit(timer)}
          disabled={isExpired}
          className="flex-1 py-3 rounded-xl bg-slate-600 text-white text-base font-medium min-h-[48px] hover:bg-slate-500 active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none"
        >
          Edit
        </button>
        {timer.isFlagged && <span className="text-amber-400 text-xl">⚑</span>}
      </div>
    </div>
  )
}
