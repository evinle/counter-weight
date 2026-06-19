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

type PushPayload = {
  serverId: string;
  title: string;
  emoji: string;
};

function parseSyncTimers(data: unknown): SyncTimerEntry[] | null {
  if (!data || typeof data !== "object") return null;
  if (!("type" in data) || (data as { type: unknown }).type !== "SYNC_TIMERS")
    return null;
  const timers = (data as { timers?: unknown }).timers;
  if (!Array.isArray(timers)) return null;
  return timers as SyncTimerEntry[];
}

function parsePushPayload(data: unknown): PushPayload | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (
    typeof d.serverId !== "string" ||
    typeof d.title !== "string" ||
    typeof d.emoji !== "string"
  )
    return null;
  return { serverId: d.serverId, title: d.title, emoji: d.emoji };
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
        body: "Time's up",
        icon: "/icon-192.png",
        tag: payload.serverId,
      });
    });

  event.waitUntil(promise);
});
