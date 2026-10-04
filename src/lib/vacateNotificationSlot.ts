import { closeNotifications, notificationSlot } from '../sw.notificationSlot'
import type { Timer } from '../db/schema'

// Fire-and-forget: the caller's own work (a Dexie write) is the source of truth and
// must never wait on, or fail because of, notification housekeeping. Waiting on
// `serviceWorker.ready` would hang forever for guests and in browsers without a worker.
export function vacateNotificationSlot(timer: { id: number; serverId: Timer['serverId'] }): void {
  // A timer that notified on this device before it synced left its notification in the
  // local slot, so that one is cleared as well as the server slot.
  const slots = new Set([
    notificationSlot(timer),
    notificationSlot({ id: timer.id, serverId: null }),
  ])

  void navigator.serviceWorker?.ready
    .then(async (registration) => {
      for (const tag of slots) {
        closeNotifications(await registration.getNotifications({ tag }))
      }
    })
    .catch((error: unknown) => {
      console.error('[notifications] could not vacate slot', error)
    })
}
