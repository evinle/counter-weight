import { useHistoryTimers } from '../hooks/useTimers'
import { ScreenTitle } from './ScreenTitle'
import { getHistoryAnnotation, HistoryTiming } from '../lib/countdown'
import { isHistoryStatus, type HistoryStatus } from '../db/schema'

const STATUS_LABELS: Record<HistoryStatus, string> = {
  completed: 'Completed',
  missed: 'Missed',
  cancelled: 'Cancelled',
}

const STATUS_COLORS: Record<HistoryStatus, string> = {
  completed: 'text-green-400',
  missed: 'text-red-400',
  cancelled: 'text-slate-400',
}

function formatAnnotation(text: string, timing: HistoryTiming): string {
  switch (timing) {
    case HistoryTiming.Early:   return `${text} remaining`
    case HistoryTiming.OnTime:  return 'On time'
    case HistoryTiming.Overdue: return `${text} overdue`
  }
}

export function HistoryView() {
  const timers = useHistoryTimers()

  if (timers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 pb-tab-bar">
        <span className="text-5xl mb-3">📋</span>
        <p className="text-sm">No completed timers yet.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col pb-tab-bar">
      <ScreenTitle title="History" />
      <div className="flex flex-col gap-3 p-4 box-border">
        {timers.map((timer) => {
          const { text, timing } = getHistoryAnnotation(timer.targetDatetime, timer.updatedAt)
          // useHistoryTimers() guarantees status ∈ HISTORY_STATUSES via Dexie query filter
          const status = timer.status 
          if(!isHistoryStatus(status)) return  <div key={timer.id} className="bg-slate-800 rounded-xl p-4 flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-red-500">Invalid timer data: {status}</span>
              </div>
            </div>

          return (
            <div key={timer.id} className="bg-slate-800 rounded-xl p-4 flex flex-col gap-1">
              <div className="flex items-center gap-2">
                {timer.emoji && <span>{timer.emoji}</span>}
                <span className="font-semibold text-white flex-1 truncate">{timer.title}</span>
                <span className={`text-xs font-medium shrink-0 ${STATUS_COLORS[status]}`}>
                  {STATUS_LABELS[status]}
                </span>
              </div>
              <p className="text-xs text-slate-400">{formatAnnotation(text, timing)}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
