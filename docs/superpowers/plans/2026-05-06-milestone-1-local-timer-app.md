# Milestone 1: Local-First Timer App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fully working PWA timer app running entirely in the browser — no backend, no auth. Users create countdowns, see them all ticking simultaneously, and receive in-app notifications when timers fire.

**Architecture:** Dexie.js (IndexedDB) as the local data store. Pure countdown logic in isolated utility functions. A Zustand store singleton (client-side timer scheduler) maintains a setTimeout chain targeting the nearest active timer and fires in-app notifications. React renders countdowns using requestAnimationFrame via a custom hook.

**Tech Stack:** React 19, Vite 6, TypeScript, Tailwind CSS 4, Dexie.js 4, Zustand, vite-plugin-pwa, Vitest, @testing-library/react, fake-indexeddb

---

## Milestones Overview

Subsequent milestones (not planned here, written when ready):

- **Milestone 2:** Backend + Auth + Cloud Sync (CDK, RDS, tRPC, Cognito, TanStack Query)
- **Milestone 3:** Push Notifications (EventBridge Scheduler, Notify Lambda, Web Push, Service Worker)
- **Milestone 4:** Groups, Tags, Sorting, Filtering
- **Milestone 5:** Metrics, Export, Production Deploy (S3, CloudFront, CI/CD)

---

## File Structure

```
src/
├── db/
│   ├── schema.ts                  # Dexie table types
│   └── index.ts                   # Dexie instance singleton
├── lib/
│   └── countdown.ts               # Pure functions: timeRemaining, formatDuration
├── store/
│   └── timerStore.ts              # Zustand store: setTimeout chain + firedTimer state
├── hooks/
│   ├── useTimers.ts               # useLiveQuery wrappers + CRUD helpers
│   └── useAnimatedCountdown.ts    # rAF-based per-card countdown
├── components/
│   ├── FeedView.tsx               # Main timer list
│   ├── TimerCard.tsx              # Individual countdown card
│   ├── CreateEditView.tsx         # Create/edit form
│   └── ToastNotification.tsx      # In-app notification display
├── test/
│   ├── setup.ts
│   ├── db.test.ts
│   ├── countdown.test.ts
│   └── timerStore.test.ts
├── App.tsx
├── main.tsx
└── index.css
```

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/test/setup.ts`

- [x] **Step 1: Initialise project**

```bash
npm create vite@latest . -- --template react-ts
npm install
```

- [x] **Step 2: Install dependencies**

```bash
npm install dexie dexie-react-hooks zustand
npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event fake-indexeddb vite-plugin-pwa @tailwindcss/vite tailwindcss
```

- [x] **Step 3: Configure Vite**

`vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Counter Weight',
        short_name: 'CounterWeight',
        theme_color: '#0f172a',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
})
```

- [x] **Step 4: Configure Vitest**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
})
```

`src/test/setup.ts`:
```ts
import '@testing-library/jest-dom'
```

- [x] **Step 5: Add test script to package.json**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest"
```

- [x] **Step 6: Replace index.css**

`src/index.css`:
```css
@import "tailwindcss";
```

- [x] **Step 7: Verify scaffold**

```bash
npm run dev
```
Expected: Vite dev server at localhost:5173, default React page renders.

```bash
npm run test
```
Expected: "No test files found", exits cleanly.

- [x] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: project scaffold — React + Vite + Tailwind + Dexie + Vitest"
```

---

### Task 2: Dexie Schema

**Files:**
- Create: `src/db/schema.ts`, `src/db/index.ts`, `src/test/db.test.ts`

- [ ] **Step 1: Write failing test**

`src/test/db.test.ts`:
```ts
import 'fake-indexeddb/auto'
import { db } from '../db'

describe('db', () => {
  beforeEach(async () => {
    await db.timers.clear()
  })

  it('creates and retrieves a timer', async () => {
    const id = await db.timers.add({
      title: 'Test timer',
      targetDatetime: new Date(Date.now() + 60_000),
      status: 'active',
      priority: 'medium',
      isFlagged: false,
      emoji: null,
      description: null,
      groupId: null,
      recurrenceRule: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const timer = await db.timers.get(id)
    expect(timer?.title).toBe('Test timer')
    expect(timer?.status).toBe('active')
  })

  it('updates a timer status', async () => {
    const id = await db.timers.add({
      title: 'Test timer',
      targetDatetime: new Date(Date.now() + 60_000),
      status: 'active',
      priority: 'medium',
      isFlagged: false,
      emoji: null,
      description: null,
      groupId: null,
      recurrenceRule: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await db.timers.update(id, { status: 'completed' })
    const timer = await db.timers.get(id)
    expect(timer?.status).toBe('completed')
  })
})
```

- [ ] **Step 2: Run — verify fails**

```bash
npm run test -- db.test.ts
```
Expected: FAIL — `../db` not found.

- [ ] **Step 3: Define schema types**

`src/db/schema.ts`:
```ts
export type TimerStatus = 'active' | 'fired' | 'completed' | 'missed' | 'cancelled'
export type Priority = 'low' | 'medium' | 'high' | 'critical'

export interface Timer {
  id?: number
  title: string
  description: string | null
  emoji: string | null
  targetDatetime: Date
  status: TimerStatus
  priority: Priority
  isFlagged: boolean
  groupId: number | null
  recurrenceRule: { cron: string; tz: string } | null
  createdAt: Date
  updatedAt: Date
}
```

- [ ] **Step 4: Create Dexie instance**

`src/db/index.ts`:
```ts
import Dexie, { type EntityTable } from 'dexie'
import type { Timer } from './schema'

class CounterWeightDB extends Dexie {
  timers!: EntityTable<Timer, 'id'>

  constructor() {
    super('counter-weight')
    this.version(1).stores({
      timers: '++id, status, targetDatetime, priority, isFlagged, groupId',
    })
  }
}

export const db = new CounterWeightDB()
```

- [ ] **Step 5: Run — verify passes**

```bash
npm run test -- db.test.ts
```
Expected: 2 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/db/ src/test/db.test.ts
git commit -m "feat: Dexie schema and db instance"
```

---

### Task 3: Countdown Utilities

**Files:**
- Create: `src/lib/countdown.ts`, `src/test/countdown.test.ts`

- [ ] **Step 1: Write failing tests**

`src/test/countdown.test.ts`:
```ts
import { timeRemaining, formatDuration } from '../lib/countdown'

describe('timeRemaining', () => {
  it('returns positive ms when target is in the future', () => {
    const target = new Date(Date.now() + 5000)
    expect(timeRemaining(target)).toBeGreaterThan(0)
  })

  it('returns 0 when target is in the past', () => {
    const target = new Date(Date.now() - 1000)
    expect(timeRemaining(target)).toBe(0)
  })
})

describe('formatDuration', () => {
  it('formats seconds only', () => {
    expect(formatDuration(45_000)).toBe('00:00:45')
  })

  it('formats minutes and seconds', () => {
    expect(formatDuration(125_000)).toBe('00:02:05')
  })

  it('formats hours', () => {
    expect(formatDuration(3_661_000)).toBe('01:01:01')
  })

  it('formats days', () => {
    expect(formatDuration(90_061_000)).toBe('1d 01:01:01')
  })

  it('returns 00:00:00 for zero', () => {
    expect(formatDuration(0)).toBe('00:00:00')
  })
})
```

- [ ] **Step 2: Run — verify fails**

```bash
npm run test -- countdown.test.ts
```
Expected: FAIL — `../lib/countdown` not found.

- [ ] **Step 3: Implement**

`src/lib/countdown.ts`:
```ts
export function timeRemaining(target: Date): number {
  return Math.max(0, target.getTime() - Date.now())
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const hms = [hours, minutes, seconds]
    .map((v) => String(v).padStart(2, '0'))
    .join(':')

  return days > 0 ? `${days}d ${hms}` : hms
}
```

- [ ] **Step 4: Run — verify passes**

```bash
npm run test -- countdown.test.ts
```
Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/countdown.ts src/test/countdown.test.ts
git commit -m "feat: countdown utility functions with tests"
```

---

### Task 4: Zustand Timer Store

**Files:**
- Create: `src/store/timerStore.ts`, `src/test/timerStore.test.ts`

The Zustand store is a module-level singleton — any component accesses it via `useTimerStore()` with no prop drilling or ref management. The setTimeout chain lives inside the store's `sync` action alongside the `firedTimer` state, keeping all timer-firing logic in one place.

- [ ] **Step 1: Write failing tests**

`src/test/timerStore.test.ts`:
```ts
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest'
import { useTimerStore } from '../store/timerStore'
import type { Timer } from '../db/schema'

function makeTimer(overrides: Partial<Timer> = {}): Timer {
  return {
    id: 1,
    title: 'Test',
    description: null,
    emoji: null,
    targetDatetime: new Date(Date.now() + 5000),
    status: 'active',
    priority: 'medium',
    isFlagged: false,
    groupId: null,
    recurrenceRule: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('timerStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useTimerStore.setState({ firedTimer: null })
  })
  afterEach(() => { vi.useRealTimers() })

  it('sets firedTimer when a timer fires', () => {
    const timer = makeTimer({ id: 1, targetDatetime: new Date(Date.now() + 1000) })
    useTimerStore.getState().sync([timer])
    vi.advanceTimersByTime(1001)
    expect(useTimerStore.getState().firedTimer).toEqual(timer)
  })

  it('does not fire a timer removed before it was due', () => {
    const timer = makeTimer({ id: 1, targetDatetime: new Date(Date.now() + 1000) })
    useTimerStore.getState().sync([timer])
    useTimerStore.getState().sync([]) // removed before firing
    vi.advanceTimersByTime(2000)
    expect(useTimerStore.getState().firedTimer).toBeNull()
  })

  it('reschedules when a sooner timer is added', () => {
    const later = makeTimer({ id: 1, targetDatetime: new Date(Date.now() + 5000) })
    const sooner = makeTimer({ id: 2, targetDatetime: new Date(Date.now() + 1000) })
    useTimerStore.getState().sync([later])
    useTimerStore.getState().sync([later, sooner])
    vi.advanceTimersByTime(1001)
    expect(useTimerStore.getState().firedTimer?.id).toBe(2)
  })

  it('fires multiple timers in order', () => {
    const fired: number[] = []
    const unsub = useTimerStore.subscribe((state) => {
      if (state.firedTimer) fired.push(state.firedTimer.id!)
    })
    const first = makeTimer({ id: 1, targetDatetime: new Date(Date.now() + 1000) })
    const second = makeTimer({ id: 2, targetDatetime: new Date(Date.now() + 2000) })
    useTimerStore.getState().sync([first, second])
    vi.advanceTimersByTime(1001)
    expect(fired).toEqual([1])
    vi.advanceTimersByTime(1000)
    expect(fired).toEqual([1, 2])
    unsub()
  })

  it('dismissFired clears firedTimer', () => {
    const timer = makeTimer({ id: 1, targetDatetime: new Date(Date.now() + 100) })
    useTimerStore.getState().sync([timer])
    vi.advanceTimersByTime(101)
    useTimerStore.getState().dismissFired()
    expect(useTimerStore.getState().firedTimer).toBeNull()
  })
})
```

- [ ] **Step 2: Run — verify fails**

```bash
npm run test -- timerStore.test.ts
```
Expected: FAIL — `../store/timerStore` not found.

- [ ] **Step 3: Implement**

`src/store/timerStore.ts`:
```ts
import { create } from 'zustand'
import type { Timer } from '../db/schema'

interface TimerState {
  firedTimer: Timer | null
  sync: (activeTimers: Timer[]) => void
  dismissFired: () => void
}

export const useTimerStore = create<TimerState>((set, get) => {
  let timeout: ReturnType<typeof setTimeout> | null = null

  function scheduleNext(timers: Timer[]) {
    if (timeout) clearTimeout(timeout)

    const next = timers
      .filter((t) => t.targetDatetime > new Date())
      .sort((a, b) => a.targetDatetime.getTime() - b.targetDatetime.getTime())[0]

    if (!next) return

    timeout = setTimeout(() => {
      set({ firedTimer: next })
      scheduleNext(timers.filter((t) => t.id !== next.id))
    }, next.targetDatetime.getTime() - Date.now())
  }

  return {
    firedTimer: null,
    sync(activeTimers) { scheduleNext(activeTimers) },
    dismissFired() { set({ firedTimer: null }) },
  }
})
```

- [ ] **Step 4: Run — verify passes**

```bash
npm run test -- timerStore.test.ts
```
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/timerStore.ts src/test/timerStore.test.ts
git commit -m "feat: Zustand timer store — setTimeout chain and firedTimer state"
```

---

### Task 5: useTimers Hook

**Files:**
- Create: `src/hooks/useTimers.ts`

- [ ] **Step 1: Implement**

`src/hooks/useTimers.ts`:
```ts
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Timer } from '../db/schema'

export function useActiveTimers(): Timer[] {
  return useLiveQuery(
    () => db.timers.where('status').equals('active').sortBy('targetDatetime'),
    [],
    []
  ) ?? []
}

export async function createTimer(
  data: Omit<Timer, 'id' | 'createdAt' | 'updatedAt'>
): Promise<number> {
  const now = new Date()
  return db.timers.add({ ...data, createdAt: now, updatedAt: now })
}

export async function completeTimer(id: number): Promise<void> {
  await db.timers.update(id, { status: 'completed', updatedAt: new Date() })
}

export async function rescheduleTimer(id: number, targetDatetime: Date): Promise<void> {
  await db.timers.update(id, { targetDatetime, updatedAt: new Date() })
}
```

`useLiveQuery` re-renders the consuming component automatically whenever the Dexie table changes. No manual subscriptions or polling needed.

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useTimers.ts
git commit -m "feat: useTimers hook — live Dexie queries and CRUD helpers"
```

---

### Task 6: useAnimatedCountdown Hook

**Files:**
- Create: `src/hooks/useAnimatedCountdown.ts`

- [ ] **Step 1: Implement**

`src/hooks/useAnimatedCountdown.ts`:
```ts
import { useState, useEffect } from 'react'
import { timeRemaining } from '../lib/countdown'

export function useAnimatedCountdown(targetDatetime: Date): number {
  const [remaining, setRemaining] = useState(() => timeRemaining(targetDatetime))

  useEffect(() => {
    let rafId: number

    const tick = () => {
      setRemaining(timeRemaining(targetDatetime))
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [targetDatetime])

  return remaining
}
```

`requestAnimationFrame` automatically pauses when the tab is hidden, preventing wasted cycles. One rAF loop runs per mounted TimerCard.

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useAnimatedCountdown.ts
git commit -m "feat: useAnimatedCountdown — rAF-based live countdown per card"
```

---

### Task 7: TimerCard Component

**Files:**
- Create: `src/components/TimerCard.tsx`

- [ ] **Step 1: Implement**

`src/components/TimerCard.tsx`:
```tsx
import { useAnimatedCountdown } from '../hooks/useAnimatedCountdown'
import { formatDuration } from '../lib/countdown'
import { completeTimer } from '../hooks/useTimers'
import type { Timer } from '../db/schema'

const PRIORITY_COLOURS: Record<string, string> = {
  low: 'text-slate-400',
  medium: 'text-blue-400',
  high: 'text-amber-400',
  critical: 'text-red-500',
}

interface Props {
  timer: Timer
  onEdit: (timer: Timer) => void
}

export function TimerCard({ timer, onEdit }: Props) {
  const remaining = useAnimatedCountdown(timer.targetDatetime)
  const isExpired = remaining === 0

  return (
    <div className={`rounded-xl p-4 bg-slate-800 flex flex-col gap-1 ${isExpired ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-base font-medium text-white truncate">
          {timer.emoji && <span className="mr-2">{timer.emoji}</span>}
          {timer.title}
        </span>
        <span className={`text-xs font-semibold uppercase ml-2 shrink-0 ${PRIORITY_COLOURS[timer.priority]}`}>
          {timer.priority}
        </span>
      </div>

      <span className="text-3xl font-mono text-white tabular-nums tracking-tight">
        {formatDuration(remaining)}
      </span>

      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={() => completeTimer(timer.id!)}
          className="text-xs px-3 py-1 rounded-full bg-green-700 text-white"
        >
          Done
        </button>
        <button
          onClick={() => onEdit(timer)}
          className="text-xs px-3 py-1 rounded-full bg-slate-600 text-white"
        >
          Edit
        </button>
        {timer.isFlagged && <span className="text-amber-400 text-sm ml-auto">⚑</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/TimerCard.tsx
git commit -m "feat: TimerCard component with live countdown display"
```

---

### Task 8: CreateEditView

**Files:**
- Create: `src/components/CreateEditView.tsx`

- [ ] **Step 1: Implement**

`src/components/CreateEditView.tsx`:
```tsx
import { useState } from 'react'
import { createTimer, rescheduleTimer } from '../hooks/useTimers'
import type { Timer, Priority } from '../db/schema'

interface Props {
  existing?: Timer
  onDone: () => void
}

export function CreateEditView({ existing, onDone }: Props) {
  const [title, setTitle] = useState(existing?.title ?? '')
  const [emoji, setEmoji] = useState(existing?.emoji ?? '')
  const [priority, setPriority] = useState<Priority>(existing?.priority ?? 'medium')
  const [isFlagged, setIsFlagged] = useState(existing?.isFlagged ?? false)
  const [targetInput, setTargetInput] = useState(() => {
    if (existing) return existing.targetDatetime.toISOString().slice(0, 16)
    return ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const targetDatetime = new Date(targetInput)

    if (existing?.id !== undefined) {
      await rescheduleTimer(existing.id, targetDatetime)
    } else {
      await createTimer({
        title,
        emoji: emoji || null,
        description: null,
        targetDatetime,
        status: 'active',
        priority,
        isFlagged,
        groupId: null,
        recurrenceRule: null,
      })
    }
    onDone()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
      <input
        className="rounded-lg p-3 bg-slate-700 text-white placeholder:text-slate-400"
        placeholder="Timer title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      <input
        className="rounded-lg p-3 bg-slate-700 text-white placeholder:text-slate-400"
        placeholder="Emoji (optional)"
        value={emoji}
        onChange={(e) => setEmoji(e.target.value)}
      />
      <input
        type="datetime-local"
        className="rounded-lg p-3 bg-slate-700 text-white"
        value={targetInput}
        onChange={(e) => setTargetInput(e.target.value)}
        required
      />
      <select
        className="rounded-lg p-3 bg-slate-700 text-white"
        value={priority}
        onChange={(e) => setPriority(e.target.value as Priority)}
      >
        {(['low', 'medium', 'high', 'critical'] as Priority[]).map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-white cursor-pointer">
        <input
          type="checkbox"
          checked={isFlagged}
          onChange={(e) => setIsFlagged(e.target.checked)}
        />
        Flag this timer
      </label>
      <button
        type="submit"
        className="rounded-lg p-3 bg-blue-600 text-white font-semibold"
      >
        {existing ? 'Update Timer' : 'Create Timer'}
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/CreateEditView.tsx
git commit -m "feat: CreateEditView — create and edit timer form"
```

---

### Task 9: FeedView, ToastNotification, App Wiring

**Files:**
- Create: `src/components/FeedView.tsx`, `src/components/ToastNotification.tsx`
- Modify: `src/App.tsx`, `src/main.tsx`

- [ ] **Step 1: ToastNotification**

`src/components/ToastNotification.tsx`:
```tsx
import type { Timer } from '../db/schema'

interface Props {
  timer: Timer
  onDismiss: () => void
}

export function ToastNotification({ timer, onDismiss }: Props) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 border border-slate-600 rounded-xl p-4 shadow-xl flex items-center gap-4 max-w-sm w-full mx-4">
      <span className="text-2xl">{timer.emoji ?? '⏰'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold truncate">{timer.title}</p>
        <p className="text-slate-400 text-sm">Timer complete</p>
      </div>
      <button onClick={onDismiss} className="text-slate-400 text-xl shrink-0">✕</button>
    </div>
  )
}
```

- [ ] **Step 2: FeedView**

`src/components/FeedView.tsx`:
```tsx
import { useActiveTimers } from '../hooks/useTimers'
import { TimerCard } from './TimerCard'
import type { Timer } from '../db/schema'

interface Props {
  onEdit: (timer: Timer) => void
}

export function FeedView({ onEdit }: Props) {
  const timers = useActiveTimers()

  if (timers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500">
        <span className="text-5xl mb-3">⏳</span>
        <p className="text-sm">No active timers. Create one to get started.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {timers.map((timer) => (
        <TimerCard key={timer.id} timer={timer} onEdit={onEdit} />
      ))}
    </div>
  )
}
```

- [ ] **Step 3: App**

`src/App.tsx`:
```tsx
import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { useTimerStore } from './store/timerStore'
import { FeedView } from './components/FeedView'
import { CreateEditView } from './components/CreateEditView'
import { ToastNotification } from './components/ToastNotification'
import type { Timer } from './db/schema'

type View = 'feed' | 'create'

export function App() {
  const [view, setView] = useState<View>('feed')
  const [editTimer, setEditTimer] = useState<Timer | undefined>()

  const sync = useTimerStore((s) => s.sync)
  const firedTimer = useTimerStore((s) => s.firedTimer)
  const dismissFired = useTimerStore((s) => s.dismissFired)

  const activeTimers = useLiveQuery(
    () => db.timers.where('status').equals('active').toArray(),
    []
  ) ?? []

  useEffect(() => { sync(activeTimers) }, [activeTimers])

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  const handleEdit = (timer: Timer) => {
    setEditTimer(timer)
    setView('create')
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white max-w-lg mx-auto">
      {firedTimer && (
        <ToastNotification timer={firedTimer} onDismiss={dismissFired} />
      )}

      <header className="flex items-center justify-between p-4 border-b border-slate-700">
        <h1 className="text-xl font-bold tracking-tight">Counter Weight</h1>
        {view === 'feed' ? (
          <button
            onClick={() => { setEditTimer(undefined); setView('create') }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold"
          >
            + New
          </button>
        ) : (
          <button onClick={() => setView('feed')} className="text-slate-400 text-sm">
            Cancel
          </button>
        )}
      </header>

      <main>
        {view === 'feed'
          ? <FeedView onEdit={handleEdit} />
          : <CreateEditView existing={editTimer} onDone={() => setView('feed')} />
        }
      </main>
    </div>
  )
}
```

- [ ] **Step 4: Update main.tsx**

`src/main.tsx`:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 5: Verify in browser**

```bash
npm run dev
```

Open http://localhost:5173. Verify:
1. Create a timer 30 seconds in the future — appears immediately in the feed
2. Countdown ticks in real time to the second
3. Toast notification appears when timer fires
4. "Done" button removes the timer from the feed
5. "Edit" button opens the form pre-populated with the timer's values
6. App works after closing and reopening the tab (data persists in IndexedDB)

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "feat: FeedView, ToastNotification, App wiring — working local timer app"
```

---

### Task 10: Full Test Suite + Production Build

**Files:** No new files.

- [ ] **Step 1: Run all tests**

```bash
npm run test
```
Expected: All tests PASS across `db.test.ts`, `countdown.test.ts`, `timerStore.test.ts`.

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3: Production build**

```bash
npm run build
```
Expected: Builds cleanly to `dist/`. Service worker generated by vite-plugin-pwa.

- [ ] **Step 4: Smoke test the build**

```bash
npm run preview
```
Open the preview URL. Verify the app loads and timers created before the build are still present (IndexedDB persists across builds).

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: milestone 1 complete — local-first timer PWA"
```
