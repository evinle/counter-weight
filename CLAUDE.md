# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Staleness check** — this file was last updated at commit `19f66ed` (2026-05-10). Before relying on the architecture section, run `git log --oneline 19f66ed..HEAD` — if significant commits have landed (changes to `src/db/`, `src/store/`, `src/hooks/`, or `App.tsx`), re-read those files rather than trusting the description below.

## Commands

```bash
npm run dev        # start Vite dev server
npm run build      # tsc + Vite production build
npm run lint       # ESLint
npm run test       # Vitest (watch mode)
npx vitest run     # Vitest single run (CI-style)
npx vitest run src/test/countdown.test.ts  # run a single test file
```

## Architecture

Counter Weight is a local-first timer PWA. All data lives in **IndexedDB via Dexie** (`src/db/`); there is no backend.

### Data flow

```
Dexie (IndexedDB)
  └── useLiveQuery (dexie-react-hooks)  ← reactive queries in App / FeedView
        └── App.tsx  ← passes activeTimers into timerStore.sync()
              └── timerStore (Zustand)  ← schedules setTimeout for next firing,
                                           exposes firedTimer for toast
```

`App.tsx` is the only place that bridges Dexie's reactive layer and the Zustand store. It calls `sync(activeTimers)` inside a `useEffect` whenever Dexie emits a new snapshot.

### Key files

| Path | Role |
|---|---|
| `src/db/schema.ts` | `Timer` type + `TimerStatus` / `Priority` enums |
| `src/db/index.ts` | Dexie DB class — single indexed table `timers` |
| `src/hooks/useTimers.ts` | CRUD helpers (`createTimer`, `completeTimer`, `rescheduleTimer`) and `useActiveTimers` live query hook |
| `src/store/timerStore.ts` | Zustand store — tracks in-memory `activeTimers`, schedules the next `setTimeout`, surfaces `firedTimer` |
| `src/lib/countdown.ts` | Pure functions: `timeRemaining(date)` → ms, `formatDuration(ms)` → display string |
| `src/hooks/useAnimatedCountdown.ts` | rAF loop that calls `timeRemaining` every frame; drives live countdown display in `TimerCard` |

### State ownership

- **Persistent truth**: Dexie (`status`, `targetDatetime`, etc.)
- **Ephemeral in-memory scheduling**: Zustand (`activeTimers` mirror + `setTimeout` handle)
- **UI navigation**: local `useState` in `App.tsx` (`view`, `editTimer`)

When a timer fires, the store sets `firedTimer`; `App.tsx` renders `<ToastNotification>` and calls `dismissFired()` on close.

### Testing

Tests use `jsdom` + `fake-indexeddb` (configured in `src/test/setup.ts`). Tests live in `src/test/`. The Vitest config is separate from Vite (`vitest.config.ts`).
