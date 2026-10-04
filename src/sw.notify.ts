import { notificationSlot, replaceInSlot } from "./sw.notificationSlot";
import type { NotificationRegistration } from "./sw.notificationSlot";
import { pushNotificationBody, pushNotificationTitle } from "./sw.push";
import type { NotifyKind, SyncTimerEntry } from "./sw.scheduler";

type NotifyTimerDeps = {
  registration: NotificationRegistration;
};

export function createNotifyTimer({ registration }: NotifyTimerDeps) {
  return async function notifyTimer(timer: SyncTimerEntry, kind: NotifyKind): Promise<void> {
    await replaceInSlot(registration, {
      slot: notificationSlot(timer),
      kind,
      title: pushNotificationTitle({ title: timer.title, emoji: timer.emoji ?? "" }),
      body: pushNotificationBody({ kind }),
    });
  };
}
