import { useEffect, useState } from 'react'
import { trpc } from '../lib/trpc.js'
import type { AuthUser } from './useAuth.js'

async function subscribeAndRegister(): Promise<void> {
  const vapidKey: string = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!vapidKey) throw new Error('VITE_VAPID_PUBLIC_KEY is not defined')

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: vapidKey,
  })
  const json = subscription.toJSON()
  const p256dh = json.keys?.['p256dh']
  const auth = json.keys?.['auth']
  if (!json.endpoint || !p256dh || !auth) {
    throw new Error('PushSubscription is missing required fields')
  }
  await trpc.pushSubscriptions.register.mutate({ endpoint: json.endpoint, p256dh, auth })
}

export function useNotifications({ user }: { user: AuthUser | null }): void {
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    'Notification' in window ? Notification.permission : 'denied'
  )

  useEffect(() => {
    if (!user || !('serviceWorker' in navigator)) return

    if (permission === 'granted') {
      subscribeAndRegister().catch(err => console.error('[useNotifications]', err))
      return
    }

    if (permission === 'default') {
      Notification.requestPermission().then(setPermission).catch(err => console.error('[useNotifications]', err))
    }
  }, [user, permission])
}
