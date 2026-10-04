import { closeNotifications } from '../sw.notificationSlot'
import { NotifyKind } from '../sw.scheduler'
import type { Timer } from '../db/schema'

// Fire-and-forget: the caller's own work (a Dexie write) is the source of truth and
// must never wait on, or fail because of, notification housekeeping. Waiting on
// `serviceWorker.ready` would hang forever for guests and in browsers without a worker.
export function vacateNotificationSlot(timer: Pick<Timer, 'id' | 'serverId'>): void {
  // The server-push slot, plus the tags the on-device scheduler uses for the same timer.
  const localTags = Object.values(NotifyKind).map((kind) => `${timer.id}-${kind}`)
  const tags = timer.serverId ? [timer.serverId, ...localTags] : localTags

  void navigator.serviceWorker?.ready
    .then(async (registration) => {
      for (const tag of tags) {
        closeNotifications(await registration.getNotifications({ tag }))
      }
    })
    .catch((error: unknown) => {
      console.error('[notifications] could not vacate slot', error)
    })
}
