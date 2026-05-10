# SW Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route timer notifications through the service worker so that OS-level notifications fire on Android when the PWA is backgrounded.

**Architecture:** Switch VitePWA to `injectManifest` mode with a custom `src/sw.ts` that receives active timer data via `postMessage` and schedules a `setTimeout` per timer, calling `self.registration.showNotification()` when each fires. `App.tsx` replaces `new Notification()` with `registration.showNotification()` for the foreground path and posts `SYNC_TIMERS` messages to the SW whenever active timers change. The SW skips its own notification if a focused window is visible (main thread handles it); `tag` on each notification deduplicates any race.

**Tech Stack:** vite-plugin-pwa 1.3.0 (injectManifest strategy), workbox-core, workbox-precaching, workbox-routing (all bundled with vite-plugin-pwa — no new dependencies).

---

## Files

| File | Action | Purpose |
|---|---|---|
| `vite.config.ts` | Modify | Switch VitePWA from `generateSW` to `injectManifest`, point at `src/sw.ts` |
| `src/sw.ts` | Create | Custom SW: Workbox precaching + `SYNC_TIMERS` message handler + per-timer `setTimeout` + `showNotification` |
| `src/App.tsx` | Modify | Add `SYNC_TIMERS` postMessage in timer sync effect; replace `new Notification()` with `registration.showNotification()` |

---

### Task 1: Switch VitePWA to injectManifest mode

**Files:**
- Modify: `vite.config.ts`

No automated test — verified by successful build in Task 4.

- [ ] **Step 1: Replace vite.config.ts**

The `workbox` config key becomes `injectManifest`. Add `strategies`, `srcDir`, and `filename`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      manifest: {
        name: 'Counter Weight',
        short_name: 'CounterWeight',
        description: 'Local-first countdown timer',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      },
    }),
  ],
  server: {
    host: true,
    https: {},
  },
  preview: {
    host: true,
    https: {},
  },
})
```

- [ ] **Step 2: Commit**

```bash
git add vite.config.ts
git commit -m "feat: switch VitePWA to injectManifest mode for custom SW"
```

---

### Task 2: Create the custom service worker

**Files:**
- Create: `src/sw.ts`

This file runs in `ServiceWorkerGlobalScope`, not the browser window. VitePWA compiles it separately and injects the Workbox precache manifest at `__WB_MANIFEST`.

**Why the SW stays alive when backgrounded:** the SW process is kept alive as long as any page it controls is open — even if that page is backgrounded. Only when the app is fully closed (removed from the task switcher) does the browser kill the SW. So `setTimeout` callbacks fire reliably for the "app backgrounded" use case.

**Visibility check:** `clients.matchAll()` returns all controlled window clients. When the app is backgrounded, clients exist but `visibilityState` is `'hidden'`. When foregrounded, it's `'visible'`. The check lets the main thread handle foreground notifications while the SW handles backgrounded ones.

- [ ] **Step 1: Create src/sw.ts**

```typescript
/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import type { PrecacheEntry } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope
declare const __WB_MANIFEST: Array<PrecacheEntry>

self.skipWaiting()
clientsClaim()

precacheAndRoute(__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

type SyncTimerEntry = {
  id: number
  title: string
  emoji: string | undefined
  targetDatetime: string  // ISO string
}

const handles = new Map<number, ReturnType<typeof setTimeout>>()

self.addEventListener('message', event => {
  const data = event.data as { type: string; timers?: SyncTimerEntry[] }
  if (data.type !== 'SYNC_TIMERS' || !data.timers) return

  for (const handle of handles.values()) clearTimeout(handle)
  handles.clear()

  for (const timer of data.timers) {
    const delay = Math.max(0, new Date(timer.targetDatetime).getTime() - Date.now())
    const handle = setTimeout(() => {
      handles.delete(timer.id)
      notifyTimer(timer)
    }, delay)
    handles.set(timer.id, handle)
  }
})

function notifyTimer(timer: SyncTimerEntry): void {
  self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then(clients => {
      if (clients.some(c => c.visibilityState === 'visible')) return
      self.registration.showNotification(timer.title, {
        body: 'Timer complete',
        icon: '/icon-192.png',
        tag: String(timer.id),
      })
    })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add src/sw.ts
git commit -m "feat: add custom SW with SYNC_TIMERS notification scheduling"
```

---

### Task 3: Update App.tsx to use SW notifications

**Files:**
- Modify: `src/App.tsx:25-44`

Two changes in the existing `useEffect` blocks:
1. In the `activeTimers` sync effect — also post `SYNC_TIMERS` to the SW.
2. In the `firedTimer` effect — replace `new Notification()` with `registration.showNotification()`.

`navigator.serviceWorker.controller` is `null` on first-ever page load (before the SW has claimed the page). The guard skips the postMessage in that case; the next Dexie update will trigger a resync once the SW has claimed.

- [ ] **Step 1: Replace lines 25–44 in src/App.tsx**

Replace these three `useEffect` blocks (the sync effect, the permission effect, and the firedTimer effect):

```tsx
  useEffect(() => {
    sync(activeTimers)
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SYNC_TIMERS',
        timers: activeTimers
          .filter((t): t is typeof t & { id: number } => t.id !== undefined)
          .map(t => ({
            id: t.id,
            title: t.title,
            emoji: t.emoji ?? undefined,
            targetDatetime: t.targetDatetime.toISOString(),
          })),
      })
    }
  }, [activeTimers])

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  useEffect(() => {
    if (!firedTimer) return
    if ('Notification' in window && Notification.permission === 'granted') {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification(firedTimer.title, {
          body: 'Timer complete',
          icon: '/icon-192.png',
          tag: String(firedTimer.id),
        })
      })
    }
    if (firedTimer.id !== undefined) {
      db.timers.update(firedTimer.id, { status: 'fired', updatedAt: new Date() })
    }
  }, [firedTimer])
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: route notifications through SW for OS-level delivery on Android"
```

---

### Task 4: Build and verify

No code changes — verifies the end result.

- [ ] **Step 1: Build**

```bash
npm run build
```

Expected: clean build. VitePWA output should show `injectManifest` mode:
```
PWA v...
mode      injectManifest
...
```

- [ ] **Step 2: Confirm SYNC_TIMERS handler is in the built SW**

```bash
grep -c 'SYNC_TIMERS' dist/sw.js
```

Expected: `1` or more (string present in minified bundle).

- [ ] **Step 3: Serve over LAN**

```bash
npm run preview
```

Note the LAN URL from the terminal output (e.g. `https://192.168.x.x:4173/`).

- [ ] **Step 4: Test on device**

1. Open the LAN URL on your phone — accept the self-signed cert warning
2. Grant notification permission when the app prompts
3. Create a timer set to fire in ~1 minute
4. Background the app (press home or switch to another app)
5. Wait for the timer to fire
6. Verify an OS-level notification appears in the notification shade

- [ ] **Step 5: Tag the release**

```bash
git tag v0.1.1
```
