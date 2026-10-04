import { isPushKind, PushKind } from "./sw.push";

export type TrayNotification = { close(): void; data: unknown };

// `renotify` is supported by browsers but missing from the DOM lib typings.
export type SlotNotificationOptions = NotificationOptions & { renotify?: boolean };

export type NotificationRegistration = {
  showNotification(title: string, options?: SlotNotificationOptions): Promise<void>;
  getNotifications(filter: { tag: string }): Promise<TrayNotification[]>;
};

export type SlotContent = {
  slot: string;
  kind: PushKind;
  title: string;
  body: string;
};

// `renotify` makes a notification that takes over an occupied slot alert the user again.
export function showInSlot(
  registration: Pick<NotificationRegistration, "showNotification">,
  { slot, kind, title, body }: SlotContent,
): Promise<void> {
  return registration.showNotification(title, {
    body,
    icon: "/icon-192.png",
    tag: slot,
    renotify: true,
    data: { kind },
  });
}

// Best-effort: one notification failing to close never stops the others.
export function closeNotifications(notifications: TrayNotification[]): void {
  for (const notification of notifications) {
    try {
      notification.close();
    } catch (error) {
      console.error("[sw] could not close a notification", error);
    }
  }
}

// One slot per timer, shared by the server-push and on-device paths. A timer that has not
// synced yet has no server identity, so its slot is named after its local one.
export function notificationSlot(timer: { id: number; serverId: string | null }): string {
  return timer.serverId ?? `local-${timer.id}`;
}

// Takes the slot: shows the new notification, then closes what was there. The old ones are
// read before showing so the new one is never closed. Reading and closing are housekeeping
// and must never stop the new notification from showing.
// The event kind a notification was shown with, or null for one shown before kinds were
// stored or by something we do not recognise.
function storedKind(data: unknown): PushKind | null {
  if (!data || typeof data !== "object" || !("kind" in data)) return null;
  const kind: unknown = Reflect.get(data, "kind");
  return isPushKind(kind) ? kind : null;
}

export async function replaceInSlot(
  registration: NotificationRegistration,
  content: SlotContent,
): Promise<void> {
  const earlier = await registration
    .getNotifications({ tag: content.slot })
    .catch((error: unknown) => {
      console.error(`[sw] could not read notifications for ${content.slot}`, error);
      return [];
    });

  // A lead or deadline happens once per timer, so one already in the slot means the other
  // path got there first. Nudges repeat, so each one is new.
  const alreadyShown =
    content.kind !== PushKind.Overdue &&
    earlier.some((notification) => storedKind(notification.data) === content.kind);
  if (alreadyShown) return;

  await showInSlot(registration, content);

  closeNotifications(earlier);
}
