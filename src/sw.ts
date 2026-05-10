/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import type { PrecacheEntry } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope
declare const __WB_MANIFEST: Array<PrecacheEntry>

self.skipWaiting()
clientsClaim()

precacheAndRoute(__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

type SyncTimerEntry = {
  id: number
  title: string
  emoji: string | undefined
  targetDatetime: string  // ISO string
}

function parseSyncTimers(data: unknown): SyncTimerEntry[] | null {
  if (!data || typeof data !== 'object') return null
  if (!('type' in data) || (data as { type: unknown }).type !== 'SYNC_TIMERS') return null
  const timers = (data as { timers?: unknown }).timers
  if (!Array.isArray(timers)) return null
  return timers as SyncTimerEntry[]
}

const handles = new Map<number, ReturnType<typeof setTimeout>>()

self.addEventListener('message', event => {
  const timers = parseSyncTimers(event.data)
  if (!timers) return

  for (const handle of handles.values()) clearTimeout(handle)
  handles.clear()

  for (const timer of timers) {
    const delay = Math.max(0, new Date(timer.targetDatetime).getTime() - Date.now())
    const handle = setTimeout(() => {
      handles.delete(timer.id)
      notifyTimer(timer)
    }, delay)
    handles.set(timer.id, handle)
  }
})

function notifyTimer(timer: SyncTimerEntry): void {
  self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then(clients => {
      if (clients.some(c => c.visibilityState === 'visible')) return
      const title = timer.emoji ? `${timer.emoji} ${timer.title}` : timer.title
      self.registration.showNotification(title, {
        body: 'Timer complete',
        icon: '/icon-192.png',
        tag: String(timer.id),
      })
    })
}
