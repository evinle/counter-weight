/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import type { PrecacheEntry } from 'workbox-precaching'
import { shouldSuppressPush } from './lib/swPushDedup.js'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<PrecacheEntry> }

self.skipWaiting()
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

type SyncTimerEntry = {
  id: number
  serverId: string | null
  title: string
  emoji: string | undefined
  targetDatetime: string  // ISO string
}

type PushPayload = {
  serverId: string
  title: string
  emoji: string
}

function parseSyncTimers(data: unknown): SyncTimerEntry[] | null {
  if (!data || typeof data !== 'object') return null
  if (!('type' in data) || (data as { type: unknown }).type !== 'SYNC_TIMERS') return null
  const timers = (data as { timers?: unknown }).timers
  if (!Array.isArray(timers)) return null
  return timers as SyncTimerEntry[]
}

const handles = new Map<number, ReturnType<typeof setTimeout>>()
const firedServerIds = new Set<string>()

self.addEventListener('message', event => {
  const timers = parseSyncTimers(event.data)
  if (!timers) return

  for (const handle of handles.values()) clearTimeout(handle)
  handles.clear()

  for (const timer of timers) {
    const delay = Math.max(0, new Date(timer.targetDatetime).getTime() - Date.now())
    const handle = setTimeout(() => {
      handles.delete(timer.id)
      if (timer.serverId) firedServerIds.add(timer.serverId)
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

self.addEventListener('push', event => {
  const payload = (event as PushEvent).data?.json() as PushPayload | undefined
  if (!payload) return

  const promise = self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then(clients => {
      const hasVisibleClient = clients.some(c => c.visibilityState === 'visible')
      if (shouldSuppressPush(payload.serverId, firedServerIds, hasVisibleClient)) return
      const title = payload.emoji ? `${payload.emoji} ${payload.title}` : payload.title
      return self.registration.showNotification(title, {
        body: 'Timer complete',
        icon: '/icon-192.png',
        tag: payload.serverId,
      })
    })

  ;(event as ExtendableEvent).waitUntil(promise)
})
