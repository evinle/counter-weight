import type { NotificationRegistration, TrayNotification } from "../../sw.notificationSlot";

export type FakeTrayEntry = {
  title: string;
  body: string | undefined;
  tag: string | undefined;
  renotify: boolean | undefined;
};

// Models an iOS-like tray: showing never collapses a same-tag notification, so only
// an explicit close removes one.
export function createFakeNotificationTray() {
  const open: FakeTrayEntry[] = [];

  const registration = {
    async showNotification(title, options) {
      open.push({
        title,
        body: options?.body,
        tag: options?.tag,
        renotify: options?.renotify,
      });
    },
    async getNotifications(filter) {
      return open
        .filter((entry) => entry.tag === filter.tag)
        .map((entry) => ({
          close() {
            open.splice(open.indexOf(entry), 1);
          },
        }) satisfies TrayNotification);
    },
  } satisfies NotificationRegistration;

  return { registration, open };
}
