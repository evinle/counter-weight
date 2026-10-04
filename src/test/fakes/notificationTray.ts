import type { NotificationRegistration, TrayNotification } from "../../sw.notificationSlot";

export type FakeTrayEntry = {
  title: string;
  body: string | undefined;
  tag: string | undefined;
  renotify: boolean | undefined;
};

// Models an iOS-like tray: showing never collapses a same-tag notification, so only
// an explicit close removes one. Failure modes are switched on per test.
export function createFakeNotificationTray() {
  const open: FakeTrayEntry[] = [];
  const unclosableTitles = new Set<string>();
  let readsFail = false;

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
      if (readsFail) throw new Error("getNotifications unsupported");
      return open
        .filter((entry) => entry.tag === filter.tag)
        .map((entry) => ({
          close() {
            if (unclosableTitles.has(entry.title)) throw new Error("close failed");
            open.splice(open.indexOf(entry), 1);
          },
        }) satisfies TrayNotification);
    },
  } satisfies NotificationRegistration;

  return {
    registration,
    open,
    // Puts a notification in the tray without going through the code under test.
    seed(entry: { title: string; tag: string; body?: string }) {
      open.push({ title: entry.title, body: entry.body, tag: entry.tag, renotify: undefined });
    },
    failReads() {
      readsFail = true;
    },
    makeUnclosable(title: string) {
      unclosableTitles.add(title);
    },
  };
}
