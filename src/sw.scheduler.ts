export const NotifyKind = {
  Lead: 'lead',
  Deadline: 'deadline',
} as const

export type NotifyKind = (typeof NotifyKind)[keyof typeof NotifyKind]

export type SyncTimerEntry = {
  id: number
  serverId: string | null
  title: string
  emoji: string | undefined
  targetDatetime: string
  leadTimeMs: number | null
}

type NotifyFn = (entry: SyncTimerEntry, kind: NotifyKind) => void | Promise<void>

export function createScheduler({ notify }: { notify: NotifyFn }) {
  // A timer callback has nobody to report a failure to, so log it instead of leaving an
  // unhandled rejection in the worker.
  function fire(timer: SyncTimerEntry, kind: NotifyKind): void {
    void (async () => notify(timer, kind))().catch((error: unknown) => {
      console.error(`[sw] could not notify ${kind} for timer ${timer.id}`, error)
    })
  }

  const leadHandles = new Map<number, ReturnType<typeof setTimeout>>()
  const deadlineHandles = new Map<number, ReturnType<typeof setTimeout>>()

  return {
    sync(timers: SyncTimerEntry[]) {
      for (const h of leadHandles.values()) clearTimeout(h)
      for (const h of deadlineHandles.values()) clearTimeout(h)
      leadHandles.clear()
      deadlineHandles.clear()

      for (const timer of timers) {
        const deadlineTime = new Date(timer.targetDatetime).getTime()
        const now = Date.now()

        if (timer.leadTimeMs != null) {
          const leadDelay = deadlineTime - timer.leadTimeMs - now
          if (leadDelay > 0) {
            const h = setTimeout(() => {
              leadHandles.delete(timer.id)
              fire(timer, NotifyKind.Lead)
            }, leadDelay)
            leadHandles.set(timer.id, h)
          }
        }

        const deadlineDelay = deadlineTime - now
        if (deadlineDelay <= 0) continue
        const h = setTimeout(() => {
          deadlineHandles.delete(timer.id)
          fire(timer, NotifyKind.Deadline)
        }, deadlineDelay)
        deadlineHandles.set(timer.id, h)
      }
    },
  }
}
