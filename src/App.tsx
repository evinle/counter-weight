import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { useTimerStore } from './store/timerStore'
import { FeedView } from './components/FeedView'
import { CreateEditView } from './components/CreateEditView'
import { ToastNotification } from './components/ToastNotification'
import type { Timer } from './db/schema'

type View = 'feed' | 'create'

export function App() {
  const [view, setView] = useState<View>('feed')
  const [editTimer, setEditTimer] = useState<Timer | undefined>()

  const sync = useTimerStore((s) => s.sync)
  const firedTimer = useTimerStore((s) => s.firedTimer)
  const dismissFired = useTimerStore((s) => s.dismissFired)

  const activeTimers = useLiveQuery(
    () => db.timers.where('status').equals('active').toArray(),
    []
  ) ?? []

  useEffect(() => { sync(activeTimers) }, [activeTimers])

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  const handleEdit = (timer: Timer) => {
    setEditTimer(timer)
    setView('create')
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white max-w-lg mx-auto">
      {firedTimer && (
        <ToastNotification timer={firedTimer} onDismiss={dismissFired} />
      )}

      <header className="flex items-center justify-between p-4 border-b border-slate-700">
        <h1 className="text-xl font-bold tracking-tight">Counter Weight</h1>
        {view === 'feed' ? (
          <button
            onClick={() => { setEditTimer(undefined); setView('create') }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold"
          >
            + New
          </button>
        ) : (
          <button onClick={() => setView('feed')} className="text-slate-400 text-sm">
            Cancel
          </button>
        )}
      </header>

      <main>
        {view === 'feed'
          ? <FeedView onEdit={handleEdit} />
          : <CreateEditView existing={editTimer} onDone={() => setView('feed')} />
        }
      </main>
    </div>
  )
}
