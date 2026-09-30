interface UnclaimedTimersModalProps {
  count: number
  onSync: () => void
  onKeep: () => void
  onRemove: () => void
}

export function UnclaimedTimersModal({ count, onSync, onKeep, onRemove }: UnclaimedTimersModalProps) {
  const pronoun = count === 1 ? 'it' : 'them'
  const noun = count === 1 ? 'timer' : 'timers'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-canvas/70" />
      <div className="relative bg-surface border border-line rounded-2xl p-6 w-full max-w-sm flex flex-col gap-5 shadow-2xl">
        <div>
          <h2 className="text-ink font-semibold text-lg mb-1">Unclaimed timers</h2>
          <p className="text-ink-muted text-sm">
            You have {count} {noun} that {count === 1 ? 'isn\'t' : 'aren\'t'} linked to your account. What would you like to do with {pronoun}?
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={onSync}
            className="w-full bg-accent text-on-accent font-semibold py-3 px-4 rounded-xl active:scale-95 transition-all cursor-pointer text-sm"
          >
            Sync to account
          </button>
          <button
            onClick={onKeep}
            className="w-full bg-surface-raised text-ink font-semibold py-3 px-4 rounded-xl active:scale-95 transition-all cursor-pointer text-sm"
          >
            Keep local
          </button>
          <button
            onClick={onRemove}
            className="w-full text-danger text-sm py-2 active:opacity-70 transition-opacity cursor-pointer"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  )
}
