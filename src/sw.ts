/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import type { PrecacheEntry } from "workbox-precaching";
import { createNotifyTimer } from "./sw.notify";
import { createScheduler } from "./sw.scheduler";
import { parsePushPayload, pushNotificationBody } from "./sw.push";
import type { SyncTimerEntry } from "./sw.scheduler";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry>;
};

self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")));

const notifyTimer = createNotifyTimer({ registration: self.registration });
const scheduler = createScheduler({ notify: notifyTimer });

function parseSyncTimers(data: unknown): SyncTimerEntry[] | null {
  if (!data || typeof data !== "object") return null;
  if (!("type" in data) || (data as { type: unknown }).type !== "SYNC_TIMERS")
    return null;
  const timers = (data as { timers?: unknown }).timers;
  if (!Array.isArray(timers)) return null;
  return timers as SyncTimerEntry[];
}

const firedServerIds = new Set<string>();

self.addEventListener("message", (event) => {
  const timers = parseSyncTimers(event.data);
  if (!timers) return;
  scheduler.sync(timers);
});

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event.data?.json());
  if (!payload) return;

  const promise = self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((clients) => {
      const hasVisibleClient = clients.some(
        (c) => c.visibilityState === "visible",
      );

      const title = payload.emoji
        ? `${payload.emoji} ${payload.title}`
        : payload.title;

      if (firedServerIds.has(payload.serverId)) {
        console.log(`[sw] already fired, skipping ${payload.serverId}`);
        return;
      }

      if (hasVisibleClient) {
        console.log(`[sw] has visible client, skipping ${payload.serverId}`);
        return;
      }

      return self.registration.showNotification(title, {
        body: pushNotificationBody(payload),
        icon: "/icon-192.png",
        tag: payload.serverId,
      });
    });

  event.waitUntil(promise);
});
