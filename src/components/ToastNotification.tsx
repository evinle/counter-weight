import type { Timer } from '../db/schema'

interface Props {
  timer: Timer
  onDismiss: () => void
}

export function ToastNotification({ timer, onDismiss }: Props) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 border border-slate-600 rounded-xl p-4 shadow-xl flex items-center gap-4 max-w-sm w-full mx-4">
      <span className="text-2xl">{timer.emoji ?? '⏰'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold truncate">{timer.title}</p>
        <p className="text-slate-400 text-sm">Timer complete</p>
      </div>
      <button onClick={onDismiss} className="text-slate-400 text-xl shrink-0">✕</button>
    </div>
  )
}
