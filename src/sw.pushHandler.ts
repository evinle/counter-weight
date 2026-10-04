import { parsePushPayload, pushNotificationBody, pushNotificationTitle } from "./sw.push";
import { replaceInSlot } from "./sw.notificationSlot";
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

    await replaceInSlot(registration, {
      slot: payload.serverId,
      kind: payload.kind,
      title: pushNotificationTitle(payload),
      body: pushNotificationBody(payload),
    });
  };
}
