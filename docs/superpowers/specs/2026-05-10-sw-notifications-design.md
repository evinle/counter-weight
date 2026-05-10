# SW Notifications Design
_2026-05-10_

## Goal

Deliver OS-level timer notifications on Android when the Counter Weight PWA is backgrounded. The current `new Notification()` call in `App.tsx` does not produce OS notifications on mobile — only `showNotification()` called from a service worker does.

**Scope:** App backgrounded (SW still alive). App closed (SW killed) is deferred to the EventBridge + Web Push backend phase described in the main spec.

---

## Architecture

Three files change:

| File | Change |
|---|---|
| `vite.config.ts` | Switch VitePWA from `generateSW` to `injectManifest` mode, point at `src/sw.ts` |
| `src/sw.ts` | New custom SW — receives `SYNC_TIMERS` messages, schedules `setTimeout` per timer, calls `self.showNotification()` on fire |
| `src/App.tsx` | Replace `new Notification()` with `registration.showNotification()`; post `SYNC_TIMERS` to SW whenever active timers change |

### Data flow

```
Dexie → useLiveQuery → App.tsx useEffect
  ├── timerStore.sync(activeTimers)                      [in-app toast, unchanged]
  └── SW.postMessage({ type: 'SYNC_TIMERS', timers })   [SW notification scheduling]

timerStore setTimeout fires (app foregrounded):
  └── firedTimer set → App.tsx useEffect
        └── registration.showNotification()             [OS notification]

SW setTimeout fires (app backgrounded):
  └── clients.matchAll() → no focused window
        └── self.showNotification()                     [OS notification]
```

---

## Message Protocol

```typescript
type SyncTimersMessage = {
  type: 'SYNC_TIMERS'
  timers: Array<{
    id: number
    title: string
    emoji: string | undefined
    targetDatetime: string   // ISO string — Date doesn't survive postMessage on all browsers
  }>
}
```

---

## SW Internals

On receiving `SYNC_TIMERS`:
1. Cancel all existing `setTimeout` handles
2. Re-schedule one `setTimeout` per timer: `targetDatetime - Date.now()`, floored at 0
3. On fire: `self.showNotification(title, { body: 'Timer complete', icon: '/icon-192.png', tag: String(timerId) })`

The `tag` field deduplicates: if both the SW and the main thread attempt to show a notification for the same timer, the browser collapses them into one.

Before showing, check `clients.matchAll({ type: 'window', includeUncontrolled: true })` — if any client reports `visibilityState === 'visible'`, skip the SW notification. The main thread foreground path handles it. `tag` is the safety net if both still fire.

---

## Edge Cases

**`controller` is null on first install** — `navigator.serviceWorker.controller` is null until the SW has claimed the page (second load after first install). Guard the `postMessage` call. Timers firing on first-ever load fall through to the main thread path.

**Timer fires while app is opening** — SW doesn't write to Dexie. On app open, a timer that fired while backgrounded will show as `active` (ticking past zero as overdue). Dexie status reconciliation on app open is a separate concern, not in scope here.

**iOS** — `showNotification()` from the SW works on iOS 16.4+ for Home Screen PWAs. The existing `Notification.requestPermission()` call in `App.tsx` covers the permission request path.

**SW lifetime** — Android Chrome kills idle SWs after roughly 30 seconds to a few minutes with no fetch activity. No mitigation is attempted. This is the known gap; the EventBridge + Web Push backend (planned in the main spec) closes it for the "app closed" case.

---

## VitePWA Config Change

Switch from `generateSW` to `injectManifest`:

```typescript
VitePWA({
  registerType: 'autoUpdate',
  strategies: 'injectManifest',
  srcDir: 'src',
  filename: 'sw.ts',
  manifest: { /* unchanged */ },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
  },
})
```

The custom `src/sw.ts` uses `workbox-precaching` to inject the Workbox manifest and adds the `SYNC_TIMERS` message handler on top.

---

## Files Summary

| File | Action |
|---|---|
| `vite.config.ts` | Modify — add `strategies`, `srcDir`, `filename` to VitePWA config |
| `src/sw.ts` | Create — custom SW with Workbox precaching + timer notification scheduling |
| `src/App.tsx` | Modify — replace `new Notification()`, add `SYNC_TIMERS` postMessage in timer sync effect |

No new dependencies required. `workbox-precaching` is already available via `vite-plugin-pwa`.
