export type SyncTimerEntry = {
  id: number
  title: string
  emoji: string | undefined
  targetDatetime: string
}

type NotifyTimerDeps = {
  registration: Pick<ServiceWorkerRegistration, 'showNotification'>
}

export function createNotifyTimer({ registration }: NotifyTimerDeps) {
  return function notifyTimer({ id, title, emoji }: SyncTimerEntry): void {
    const notifTitle = emoji ? `${emoji} ${title}` : title
    registration.showNotification(notifTitle, {
      body: 'Timer complete',
      icon: '/icon-192.png',
      tag: String(id),
    })
  }
}
