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
import { createPushHandler } from "./sw.pushHandler";
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

self.addEventListener("message", (event) => {
  const timers = parseSyncTimers(event.data);
  if (!timers) return;
  scheduler.sync(timers);
});

const handlePush = createPushHandler({
  registration: self.registration,
  hasVisibleClient: async () => {
    const clients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    return clients.some((c) => c.visibilityState === "visible");
  },
});

self.addEventListener("push", (event) => {
  event.waitUntil(handlePush(event.data?.json()));
});
