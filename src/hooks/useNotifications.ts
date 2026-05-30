import { useEffect } from 'react'
import { trpc } from '../lib/trpc.js'
import type { AuthUser } from './useAuth.js'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string

async function subscribeAndRegister(): Promise<void> {
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: VAPID_PUBLIC_KEY,
  })
  const json = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  await trpc.pushSubscriptions.register.mutate({
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
  })
}

export function useNotifications({ user }: { user: AuthUser | null }): void {
  useEffect(() => {
    if (!user) return
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return

    const permission = Notification.permission

    if (permission === 'granted') {
      subscribeAndRegister().catch(() => {})
      return
    }

    if (permission === 'default') {
      Notification.requestPermission().then(result => {
        if (result === 'granted') subscribeAndRegister().catch(() => {})
      })
    }
  }, [user])
}
