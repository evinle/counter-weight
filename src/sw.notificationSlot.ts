export type TrayNotification = { close(): void };

// `renotify` is supported by browsers but missing from the DOM lib typings.
export type SlotNotificationOptions = NotificationOptions & { renotify?: boolean };

export type NotificationRegistration = {
  showNotification(title: string, options?: SlotNotificationOptions): Promise<void>;
  getNotifications(filter: { tag: string }): Promise<TrayNotification[]>;
};

export type SlotContent = {
  slot: string;
  title: string;
  body: string;
};

// `renotify` makes a notification that takes over an occupied slot alert the user again.
export function showInSlot(
  registration: Pick<NotificationRegistration, "showNotification">,
  { slot, title, body }: SlotContent,
): Promise<void> {
  return registration.showNotification(title, {
    body,
    icon: "/icon-192.png",
    tag: slot,
    renotify: true,
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
