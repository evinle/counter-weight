import { parsePushPayload, pushNotificationBody, pushNotificationTitle } from "./sw.push";
import { closeNotifications, showInSlot } from "./sw.notificationSlot";
import type { NotificationRegistration } from "./sw.notificationSlot";

type PushHandlerDeps = {
  registration: NotificationRegistration;
  hasVisibleClient: () => Promise<boolean>;
};

export function createPushHandler({ registration, hasVisibleClient }: PushHandlerDeps) {
  return async function handlePush(data: unknown): Promise<void> {
    const payload = parsePushPayload(data);
    if (!payload) return;
    if (await hasVisibleClient()) return;

    // Housekeeping only: failing to read the tray must never stop the new notification.
    const earlier = await registration
      .getNotifications({ tag: payload.serverId })
      .catch((error: unknown) => {
        console.error(`[sw] could not read notifications for ${payload.serverId}`, error);
        return [];
      });

    await showInSlot(registration, {
      slot: payload.serverId,
      title: pushNotificationTitle(payload),
      body: pushNotificationBody(payload),
    });

    closeNotifications(earlier);
  };
}
