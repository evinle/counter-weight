import { NotifyKind } from "./sw.scheduler";
import type { SyncTimerEntry, NotifyKind as NotifyKindT } from "./sw.scheduler";

type NotifyTimerDeps = {
  registration: Pick<ServiceWorkerRegistration, "showNotification">;
};

export function createNotifyTimer({ registration }: NotifyTimerDeps) {
  return function notifyTimer(
    { id, title, emoji }: SyncTimerEntry,
    kind: NotifyKindT,
  ): void {
    const notifTitle = emoji ? `${emoji} ${title}` : title;
    const body = kind === NotifyKind.Lead ? "Time's almost up" : "Time's up";
    registration.showNotification(notifTitle, {
      body,
      icon: "/icon-192.png",
      tag: `${id}-${kind}`,
    });
  };
}
