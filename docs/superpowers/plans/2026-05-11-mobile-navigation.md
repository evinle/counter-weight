# Mobile Navigation (Milestone 1.3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the top header bar with a 5-tab bottom navigation bar (Timers, History, +, Analytics, Settings) for mobile-first UX, and add a History tab showing completed/missed/cancelled timers with time annotations.

**Architecture:** `App.tsx` gains two state variables — `tab` (which tab is active) and `activeAction` (whether a nested screen like CreateEditView is open). The bottom tab bar is hidden when `activeAction` is set. Bar height is driven by a TS constant exposed as a CSS variable, consumed by a custom Tailwind v4 `@utility` class (`pb-tab-bar`) shared across all tab views.

**Tech Stack:** React, TypeScript, Dexie (IndexedDB), Tailwind CSS v4, Vitest

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/layout.ts` | `BOTTOM_TAB_BAR_HEIGHT` constant |
| Create | `src/lib/navigation.ts` | `Tab` and `ActiveAction` const enums + types |
| Create | `src/components/ScreenTitle.tsx` | Reusable screen heading |
| Create | `src/components/BottomTabBar.tsx` | 5-item fixed bottom nav |
| Create | `src/components/HistoryView.tsx` | Completed/missed/cancelled timer list |
| Create | `src/components/AnalyticsView.tsx` | Placeholder |
| Create | `src/components/SettingsView.tsx` | Placeholder |
| Modify | `src/index.css` | Add `@utility pb-tab-bar` |
| Modify | `src/main.tsx` | Initialize `--bottom-tab-bar-height` CSS variable |
| Modify | `src/db/schema.ts` | Add `HISTORY_STATUSES` + `HistoryStatus` |
| Modify | `src/lib/countdown.ts` | Add `HistoryTiming` enum + `getHistoryAnnotation` helper |
| Modify | `src/hooks/useTimers.ts` | Add `useHistoryTimers` hook |
| Modify | `src/components/FeedView.tsx` | Add `ScreenTitle`, apply `pb-tab-bar` |
| Modify | `src/components/CreateEditView.tsx` | Add Cancel button, apply `pb-tab-bar` |
| Modify | `src/App.tsx` | Replace state/routing, remove header, wire tab bar |
| Modify | `src/test/countdown.test.ts` | Tests for `getHistoryAnnotation` |
| Modify | `src/test/db.test.ts` | Test for history query pattern |

---

### Task 1: Layout constant, CSS utility, and CSS variable initialization

**Files:**
- Create: `src/lib/layout.ts`
- Modify: `src/index.css`
- Modify: `src/main.tsx`

- [ ] **Step 1: Create `src/lib/layout.ts`**

```ts
export const BOTTOM_TAB_BAR_HEIGHT = 64
```

- [ ] **Step 2: Add the `pb-tab-bar` utility to `src/index.css`**

Replace the entire file with:

```css
@import "tailwindcss";

body {
  /* slate-900 */
  background-color: var(--color-slate-900)
}

html {
  overscroll-behavior: none;
  overflow: hidden;
}

@utility pb-tab-bar {
  padding-bottom: var(--bottom-tab-bar-height);
}
```

- [ ] **Step 3: Initialize the CSS variable in `src/main.tsx`**

Replace the entire file with:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { BOTTOM_TAB_BAR_HEIGHT } from './lib/layout'
import './index.css'

document.documentElement.style.setProperty('--bottom-tab-bar-height', `${BOTTOM_TAB_BAR_HEIGHT}px`)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

- [ ] **Step 4: Verify the build is clean**

Run: `npm run build`
Expected: No TypeScript or Vite errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/layout.ts src/index.css src/main.tsx
git commit -m "feat: layout constant, CSS variable, and pb-tab-bar utility"
```

---

### Task 2: Navigation types

**Files:**
- Create: `src/lib/navigation.ts`

`Tab` covers the four visible tabs. `ActiveAction` distinguishes between resting on a tab and being inside a nested action screen.

- [ ] **Step 1: Create `src/lib/navigation.ts`**

```ts
export const ALL_TABS = ['timers', 'history', 'analytics', 'settings'] as const

export const Tab = {
  Timers: 'timers',
  History: 'history',
  Analytics: 'analytics',
  Settings: 'settings',
} as const satisfies Record<string, typeof ALL_TABS[number]>
export type Tab = typeof Tab[keyof typeof Tab]

export const ALL_ACTIONS = ['none', 'create-edit'] as const

export const ActiveAction = {
  None: 'none',
  CreateEdit: 'create-edit',
} as const satisfies Record<string, typeof ALL_ACTIONS[number]>
export type ActiveAction = typeof ActiveAction[keyof typeof ActiveAction]
```

- [ ] **Step 2: Verify types compile**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/navigation.ts
git commit -m "feat: Tab and ActiveAction navigation types"
```

---

### Task 3: `ScreenTitle` component

**Files:**
- Create: `src/components/ScreenTitle.tsx`

- [ ] **Step 1: Create `src/components/ScreenTitle.tsx`**

```tsx
interface Props {
  title: string
}

export function ScreenTitle({ title }: Props) {
  return (
    <h1 className="text-2xl font-bold tracking-tight text-white px-4 pt-4 pb-2">
      {title}
    </h1>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ScreenTitle.tsx
git commit -m "feat: ScreenTitle component"
```

---

### Task 4: Add `HISTORY_STATUSES` + `HistoryStatus` to schema

**Files:**
- Modify: `src/db/schema.ts`

`HistoryStatus` is a typed subset of `TimerStatus` for the three terminal states shown in the History tab. Defining it in `schema.ts` keeps all status domain knowledge in one place.

- [ ] **Step 1: Append to `src/db/schema.ts`**

```ts
export const HISTORY_STATUSES = ['completed', 'missed', 'cancelled'] as const satisfies ReadonlyArray<TimerStatus>
export type HistoryStatus = typeof HISTORY_STATUSES[number]
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat: HISTORY_STATUSES and HistoryStatus schema types"
```

---

### Task 5: `HistoryTiming` enum + `getHistoryAnnotation` helper (TDD)

**Files:**
- Modify: `src/lib/countdown.ts`
- Modify: `src/test/countdown.test.ts`

`HistoryTiming` is a three-value const enum: `Early` (updatedAt < target), `OnTime` (exact match), `Overdue` (updatedAt > target). Using a discriminated enum instead of `isEarly: boolean` makes all three cases explicit — both, neither, or exactly one can't happen with an enum. `getHistoryAnnotation` returns `{ text: string; timing: HistoryTiming }`.

- [ ] **Step 1: Write the failing tests**

Append to `src/test/countdown.test.ts`:

```ts
import { getHistoryAnnotation, HistoryTiming } from '../lib/countdown'

describe('getHistoryAnnotation', () => {
  it('returns Early timing and remaining text when updatedAt is before target', () => {
    const target = new Date('2026-01-01T12:00:00Z')
    const updated = new Date('2026-01-01T11:55:00Z') // 5 minutes before
    const { text, timing } = getHistoryAnnotation(target, updated)
    expect(timing).toBe(HistoryTiming.Early)
    expect(text).toBe('00:05:00')
  })

  it('returns Overdue timing when updatedAt is after target', () => {
    const target = new Date('2026-01-01T12:00:00Z')
    const updated = new Date('2026-01-01T12:10:00Z') // 10 minutes after
    const { text, timing } = getHistoryAnnotation(target, updated)
    expect(timing).toBe(HistoryTiming.Overdue)
    expect(text).toBe('00:10:00')
  })

  it('returns OnTime timing and 00:00:00 when updatedAt equals target exactly', () => {
    const t = new Date('2026-01-01T12:00:00Z')
    const { text, timing } = getHistoryAnnotation(t, t)
    expect(timing).toBe(HistoryTiming.OnTime)
    expect(text).toBe('00:00:00')
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run src/test/countdown.test.ts`
Expected: FAIL — `HistoryTiming` and `getHistoryAnnotation` are not exported from `../lib/countdown`.

- [ ] **Step 3: Implement `HistoryTiming` and `getHistoryAnnotation` in `src/lib/countdown.ts`**

Append to the end of `src/lib/countdown.ts`:

```ts
export const ALL_HISTORY_TIMINGS = ['early', 'on-time', 'overdue'] as const

export const HistoryTiming = {
  Early: 'early',
  OnTime: 'on-time',
  Overdue: 'overdue',
} as const satisfies Record<string, typeof ALL_HISTORY_TIMINGS[number]>
export type HistoryTiming = typeof HistoryTiming[keyof typeof HistoryTiming]

export function getHistoryAnnotation(
  targetDatetime: Date,
  updatedAt: Date
): { text: string; timing: HistoryTiming } {
  const diffMs = targetDatetime.getTime() - updatedAt.getTime()
  if (diffMs > 0) return { text: formatDuration(diffMs), timing: HistoryTiming.Early }
  if (diffMs < 0) return { text: formatDuration(-diffMs), timing: HistoryTiming.Overdue }
  return { text: formatDuration(0), timing: HistoryTiming.OnTime }
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run src/test/countdown.test.ts`
Expected: All tests pass, including prior `timeRemaining` and `formatDuration` tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/countdown.ts src/test/countdown.test.ts
git commit -m "feat: HistoryTiming enum and getHistoryAnnotation helper with tests"
```

---

### Task 6: `useHistoryTimers` hook (TDD)

**Files:**
- Modify: `src/hooks/useTimers.ts`
- Modify: `src/test/db.test.ts`

`useHistoryTimers` wraps a Dexie query using `HISTORY_STATUSES` from `schema.ts`, sorted by `targetDatetime` descending. The test exercises the raw query logic directly against `fake-indexeddb` without rendering the hook.

- [ ] **Step 1: Write the failing test**

Append to `src/test/db.test.ts`:

```ts
describe('history query', () => {
  beforeEach(async () => {
    await db.timers.clear()
  })

  it('returns completed, missed, and cancelled timers sorted by targetDatetime descending, excluding active', async () => {
    const base = {
      priority: 'medium' as const,
      isFlagged: false,
      emoji: null,
      description: null,
      groupId: null,
      recurrenceRule: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    await db.timers.add({ ...base, title: 'Active', targetDatetime: new Date('2026-03-01'), status: 'active' })
    await db.timers.add({ ...base, title: 'Completed', targetDatetime: new Date('2026-01-01'), status: 'completed' })
    await db.timers.add({ ...base, title: 'Missed', targetDatetime: new Date('2026-02-01'), status: 'missed' })
    await db.timers.add({ ...base, title: 'Cancelled', targetDatetime: new Date('2026-03-01'), status: 'cancelled' })

    const results = await db.timers
      .where('status')
      .anyOf('completed', 'missed', 'cancelled')
      .toArray()
      .then((arr) =>
        arr.sort((a, b) => b.targetDatetime.getTime() - a.targetDatetime.getTime())
      )

    expect(results).toHaveLength(3)
    expect(results.map((t) => t.title)).toEqual(['Cancelled', 'Missed', 'Completed'])
  })
})
```

- [ ] **Step 2: Run the test to confirm it passes (validates the query pattern)**

Run: `npx vitest run src/test/db.test.ts`
Expected: All tests pass. (The test validates the query pattern before the hook wraps it.)

- [ ] **Step 3: Add `useHistoryTimers` to `src/hooks/useTimers.ts`**

Append after `useFeedTimers`:

```ts
import { HISTORY_STATUSES } from '../db/schema'

export function useHistoryTimers(): Timer[] {
  return (
    useLiveQuery(
      () =>
        db.timers
          .where('status')
          .anyOf(...HISTORY_STATUSES)
          .toArray()
          .then((arr) =>
            arr.sort((a, b) => b.targetDatetime.getTime() - a.targetDatetime.getTime())
          ),
      [],
      []
    ) ?? []
  )
}
```

- [ ] **Step 4: Verify build is clean**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTimers.ts src/test/db.test.ts
git commit -m "feat: useHistoryTimers hook with query test"
```

---

### Task 7: `BottomTabBar` component

**Files:**
- Create: `src/components/BottomTabBar.tsx`

Fixed to bottom (`z-50`). Left pair: Timers, History. Center: filled blue circle + button. Right pair: Analytics, Settings. Active tab = blue tint; inactive = muted slate. Height driven by the CSS variable.

- [ ] **Step 1: Create `src/components/BottomTabBar.tsx`**

```tsx
import { Tab } from '../lib/navigation'

interface Props {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  onCreateNew: () => void
}

const LEFT_TABS = [
  { tab: Tab.Timers, label: 'Timers', icon: '⏱' },
  { tab: Tab.History, label: 'History', icon: '📋' },
] as const

const RIGHT_TABS = [
  { tab: Tab.Analytics, label: 'Analytics', icon: '📊' },
  { tab: Tab.Settings, label: 'Settings', icon: '⚙️' },
] as const

interface TabButtonProps {
  active: boolean
  label: string
  icon: string
  onClick: () => void
}

function TabButton({ active, label, icon, onClick }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
        active ? 'text-blue-400' : 'text-slate-500'
      }`}
    >
      <span className="text-xl leading-none">{icon}</span>
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  )
}

export function BottomTabBar({ activeTab, onTabChange, onCreateNew }: Props) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto z-50 bg-slate-900 border-t border-slate-700 flex items-center"
      style={{ height: 'var(--bottom-tab-bar-height)' }}
    >
      {LEFT_TABS.map(({ tab, label, icon }) => (
        <TabButton
          key={tab}
          active={activeTab === tab}
          label={label}
          icon={icon}
          onClick={() => onTabChange(tab)}
        />
      ))}

      <button
        onClick={onCreateNew}
        className="flex-1 flex items-center justify-center cursor-pointer"
        aria-label="Create new timer"
      >
        <span className="bg-blue-600 text-white text-2xl font-light w-12 h-12 rounded-full flex items-center justify-center active:scale-95 transition-transform leading-none">
          +
        </span>
      </button>

      {RIGHT_TABS.map(({ tab, label, icon }) => (
        <TabButton
          key={tab}
          active={activeTab === tab}
          label={label}
          icon={icon}
          onClick={() => onTabChange(tab)}
        />
      ))}
    </nav>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/BottomTabBar.tsx
git commit -m "feat: BottomTabBar component"
```

---

### Task 8: `HistoryView` component

**Files:**
- Create: `src/components/HistoryView.tsx`

Status badge colors: Completed = green, Missed = red, Cancelled = slate. Time annotation derived from `HistoryTiming` via a switch — three distinct labels with no boolean ambiguity.

- [ ] **Step 1: Create `src/components/HistoryView.tsx`**

```tsx
import { useHistoryTimers } from '../hooks/useTimers'
import { ScreenTitle } from './ScreenTitle'
import { getHistoryAnnotation, HistoryTiming } from '../lib/countdown'
import type { HistoryStatus } from '../db/schema'

const STATUS_LABELS: Record<HistoryStatus, string> = {
  completed: 'Completed',
  missed: 'Missed',
  cancelled: 'Cancelled',
}

const STATUS_COLORS: Record<HistoryStatus, string> = {
  completed: 'text-green-400',
  missed: 'text-red-400',
  cancelled: 'text-slate-400',
}

function formatAnnotation(text: string, timing: HistoryTiming): string {
  switch (timing) {
    case HistoryTiming.Early:   return `${text} remaining`
    case HistoryTiming.OnTime:  return 'On time'
    case HistoryTiming.Overdue: return `${text} overdue`
  }
}

export function HistoryView() {
  const timers = useHistoryTimers()

  if (timers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 pb-tab-bar">
        <span className="text-5xl mb-3">📋</span>
        <p className="text-sm">No completed timers yet.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col pb-tab-bar">
      <ScreenTitle title="History" />
      <div className="flex flex-col gap-3 p-4 box-border">
        {timers.map((timer) => {
          const { text, timing } = getHistoryAnnotation(timer.targetDatetime, timer.updatedAt)
          const status = timer.status as HistoryStatus

          return (
            <div key={timer.id} className="bg-slate-800 rounded-xl p-4 flex flex-col gap-1">
              <div className="flex items-center gap-2">
                {timer.emoji && <span>{timer.emoji}</span>}
                <span className="font-semibold text-white flex-1 truncate">{timer.title}</span>
                <span className={`text-xs font-medium shrink-0 ${STATUS_COLORS[status]}`}>
                  {STATUS_LABELS[status]}
                </span>
              </div>
              <p className="text-xs text-slate-400">{formatAnnotation(text, timing)}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/HistoryView.tsx
git commit -m "feat: HistoryView component"
```

---

### Task 9: Placeholder views (Analytics + Settings)

**Files:**
- Create: `src/components/AnalyticsView.tsx`
- Create: `src/components/SettingsView.tsx`

- [ ] **Step 1: Create `src/components/AnalyticsView.tsx`**

```tsx
import { ScreenTitle } from './ScreenTitle'

export function AnalyticsView() {
  return (
    <div className="flex flex-col pb-tab-bar">
      <ScreenTitle title="Analytics" />
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <span className="text-5xl mb-3">📊</span>
        <p className="text-sm">Analytics coming soon.</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/components/SettingsView.tsx`**

```tsx
import { ScreenTitle } from './ScreenTitle'

export function SettingsView() {
  return (
    <div className="flex flex-col pb-tab-bar">
      <ScreenTitle title="Settings" />
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <span className="text-5xl mb-3">⚙️</span>
        <p className="text-sm">Settings coming soon.</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/AnalyticsView.tsx src/components/SettingsView.tsx
git commit -m "feat: Analytics and Settings placeholder views"
```

---

### Task 10: Update `FeedView`

**Files:**
- Modify: `src/components/FeedView.tsx`

Add `<ScreenTitle title="Timers" />` and apply `pb-tab-bar`. The empty state also gets `pb-tab-bar` so its centering respects the tab bar area.

- [ ] **Step 1: Replace `src/components/FeedView.tsx`**

```tsx
import { useFeedTimers } from '../hooks/useTimers'
import { TimerCard } from './TimerCard'
import { ScreenTitle } from './ScreenTitle'
import type { Timer } from '../db/schema'

interface Props {
  onEdit: (timer: Timer) => void
}

export function FeedView({ onEdit }: Props) {
  const timers = useFeedTimers()

  if (timers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 pb-tab-bar">
        <span className="text-5xl mb-3">⏳</span>
        <p className="text-sm">No active timers. Create one to get started.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col pb-tab-bar">
      <ScreenTitle title="Timers" />
      <div className="flex flex-col gap-3 p-4 box-border">
        {timers.map((timer) => (
          <TimerCard key={timer.id} timer={timer} onEdit={onEdit} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/FeedView.tsx
git commit -m "feat: add ScreenTitle and pb-tab-bar to FeedView"
```

---

### Task 11: Update `CreateEditView`

**Files:**
- Modify: `src/components/CreateEditView.tsx`

Add Cancel button as the last item in the form, below Submit. Split `p-4` into `px-4 pt-4` and let `pb-tab-bar` control bottom padding so the Cancel button clears the bar even without the bar being visible.

- [ ] **Step 1: Replace `src/components/CreateEditView.tsx`**

```tsx
import { useState } from 'react'
import { createTimer, rescheduleTimer } from '../hooks/useTimers'
import { DurationInput } from './DurationInput'
import { DateTimeInput } from './DateTimeInput'
import { EmojiButton } from './EmojiButton'
import { durationToMs, msToDuration } from '../lib/duration'
import type { DurationValue } from '../lib/duration'
import { timeRemaining } from '../lib/countdown'
import { PRIORITIES, isPriority } from '../db/schema'
import type { Timer, Priority } from '../db/schema'

const TimerMode = {
  FromNow: 'from-now',
  AtTime: 'at-time',
} as const

type TimerMode = typeof TimerMode[keyof typeof TimerMode]

interface Props {
  existing?: Timer
  onDone: () => void
}

export function CreateEditView({ existing, onDone }: Props) {
  const [title, setTitle] = useState(existing?.title ?? '')
  const [emoji, setEmoji] = useState(existing?.emoji ?? '')
  const [priority, setPriority] = useState<Priority>(existing?.priority ?? 'medium')
  const [mode, setMode] = useState<TimerMode>(TimerMode.FromNow)
  const [duration, setDuration] = useState<DurationValue>(() => {
    if (existing) return msToDuration(timeRemaining(existing.targetDatetime))
    return { days: 0, hours: 0, minutes: 5, seconds: 0 }
  })
  const [atTime, setAtTime] = useState<Date>(() => {
    const nextHourTarget = existing?.targetDatetime ?? new Date()
    nextHourTarget.setHours(nextHourTarget.getHours() + 1, 0, 0, 0)
    return nextHourTarget
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const targetDatetime =
      mode === TimerMode.FromNow
        ? new Date(Date.now() + durationToMs(duration.days, duration.hours, duration.minutes, duration.seconds))
        : atTime

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
        isFlagged: false,
        groupId: null,
        recurrenceRule: null,
      })
    }
    onDone()
  }

  function renderModeInput() {
    switch (mode) {
      case TimerMode.FromNow:
        return <DurationInput value={duration} onChange={setDuration} />
      case TimerMode.AtTime:
        return <DateTimeInput value={atTime} onChange={setAtTime} />
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-4 pt-4 box-border pb-tab-bar">
      <div className="flex gap-2 items-center">
        <input
          id="timer-title"
          className="flex-1 rounded-lg p-3 bg-slate-700 text-white text-base placeholder:text-slate-400 min-h-[52px]"
          placeholder="What are you timing?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <EmojiButton value={emoji} onChange={setEmoji} />
      </div>

      <div className="flex rounded-xl overflow-hidden border border-slate-600">
        <button
          type="button"
          onClick={() => setMode(TimerMode.FromNow)}
          className={`flex-1 py-3 text-base font-medium transition-colors ${
            mode === TimerMode.FromNow ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'
          }`}
        >
          From now
        </button>
        <button
          type="button"
          onClick={() => setMode(TimerMode.AtTime)}
          className={`flex-1 py-3 text-base font-medium transition-colors ${
            mode === TimerMode.AtTime ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'
          }`}
        >
          At time
        </button>
      </div>

      {renderModeInput()}

      <div className="flex flex-col gap-1">
        <label htmlFor="timer-priority" className="text-sm text-slate-400">Priority</label>
        <select
          id="timer-priority"
          className="rounded-lg p-3 bg-slate-700 text-white text-base min-h-[52px]"
          value={priority}
          onChange={(e) => {
            if (isPriority(e.target.value)) setPriority(e.target.value)
          }}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        className="rounded-lg p-4 bg-blue-600 text-white text-base font-semibold min-h-[52px] hover:bg-blue-500 active:scale-95 transition-all"
      >
        {existing ? 'Update Timer' : 'Create Timer'}
      </button>

      <button
        type="button"
        onClick={onDone}
        className="rounded-lg p-3 text-slate-400 text-base font-medium active:opacity-60 transition-opacity cursor-pointer"
      >
        Cancel
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/CreateEditView.tsx
git commit -m "feat: move Cancel button into CreateEditView form"
```

---

### Task 12: Refactor `App.tsx`

**Files:**
- Modify: `src/App.tsx`

The biggest change. Removes `<header>`, replaces `view` state with `tab` + `activeAction`, mounts `BottomTabBar` conditionally, and wires all views. The notification permission banner is repositioned above the tab bar (using the CSS variable) and only shown when the bar is visible. The swDebug toast moves from `top-20` to `top-4` since the header is gone.

- [ ] **Step 1: Replace `src/App.tsx` entirely**

```tsx
import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { useTimerStore } from './store/timerStore'
import { FeedView } from './components/FeedView'
import { HistoryView } from './components/HistoryView'
import { AnalyticsView } from './components/AnalyticsView'
import { SettingsView } from './components/SettingsView'
import { CreateEditView } from './components/CreateEditView'
import { BottomTabBar } from './components/BottomTabBar'
import { ToastNotification } from './components/ToastNotification'
import { Tab, ActiveAction } from './lib/navigation'
import type { Timer } from './db/schema'

export function App() {
  const [tab, setTab] = useState<Tab>(Tab.Timers)
  const [activeAction, setActiveAction] = useState<ActiveAction>(ActiveAction.None)
  const [editTimer, setEditTimer] = useState<Timer | undefined>()
  const [swDebug, setSwDebug] = useState<string | null>(null)

  const sync = useTimerStore((s) => s.sync)
  const firedTimer = useTimerStore((s) => s.firedTimer)
  const dismissFired = useTimerStore((s) => s.dismissFired)

  const activeTimers =
    useLiveQuery(() => db.timers.where('status').equals('active').toArray(), []) ?? []

  useEffect(() => {
    sync(activeTimers)
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SYNC_TIMERS',
        timers: activeTimers
          .filter((t): t is typeof t & { id: number } => t.id !== undefined)
          .map((t) => ({
            id: t.id,
            title: t.title,
            emoji: t.emoji ?? undefined,
            targetDatetime: t.targetDatetime.toISOString(),
          })),
      })
    }
  }, [activeTimers])

  const [notifPermission, setNotifPermission] = useState<NotificationPermission | null>(null)

  useEffect(() => {
    if ('Notification' in window) setNotifPermission(Notification.permission)
  }, [])

  function requestNotifPermission() {
    Notification.requestPermission().then((p) => setNotifPermission(p))
  }

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.ready.then((reg) => {
      setSwDebug(`SW ready · ${reg.scope}`)
      setTimeout(() => setSwDebug(null), 4000)
    })
  }, [])

  useEffect(() => {
    if (!firedTimer) return
    if ('Notification' in window && Notification.permission === 'granted') {
      navigator.serviceWorker.ready.then((reg) => {
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

  const handleEdit = (timer: Timer) => {
    setEditTimer(timer)
    setActiveAction(ActiveAction.CreateEdit)
  }

  const handleCreateNew = () => {
    setEditTimer(undefined)
    setActiveAction(ActiveAction.CreateEdit)
  }

  const handleDone = () => {
    setActiveAction(ActiveAction.None)
    setEditTimer(undefined)
  }

  function renderContent() {
    if (activeAction === ActiveAction.CreateEdit) {
      return <CreateEditView existing={editTimer} onDone={handleDone} />
    }
    switch (tab) {
      case Tab.Timers:    return <FeedView onEdit={handleEdit} />
      case Tab.History:   return <HistoryView />
      case Tab.Analytics: return <AnalyticsView />
      case Tab.Settings:  return <SettingsView />
    }
  }

  return (
    <div className="h-dvh bg-slate-900 text-white max-w-lg mx-auto overscroll-none">
      {firedTimer && (
        <ToastNotification timer={firedTimer} onDismiss={dismissFired} />
      )}
      {swDebug && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-700 text-slate-200 text-xs px-4 py-2 rounded-lg shadow-lg whitespace-nowrap">
          {swDebug}
        </div>
      )}
      {notifPermission === 'default' && activeAction === ActiveAction.None && (
        <div
          className="fixed left-4 right-4 z-40 bg-slate-800 border border-slate-600 rounded-xl p-4 flex items-center justify-between gap-4 shadow-xl"
          style={{ bottom: 'calc(var(--bottom-tab-bar-height) + 1rem)' }}
        >
          <p className="text-sm text-slate-300">Enable notifications for timer alerts</p>
          <button
            onClick={requestNotifPermission}
            className="shrink-0 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg active:scale-95 transition-all cursor-pointer"
          >
            Enable
          </button>
        </div>
      )}

      <main className="h-full overflow-auto box-border py-2">
        {renderContent()}
      </main>

      {activeAction === ActiveAction.None && (
        <BottomTabBar
          activeTab={tab}
          onTabChange={setTab}
          onCreateNew={handleCreateNew}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 3: Start the dev server and smoke test**

Run: `npm run dev`

Verify:
- [ ] Timers tab shows active/fired timers with "Timers" heading
- [ ] History tab shows completed/missed/cancelled timers with status badges and time annotations
- [ ] Analytics and Settings show placeholder screens
- [ ] + button opens CreateEditView (tab bar disappears, Cancel visible below Submit)
- [ ] Editing a timer via TimerCard opens CreateEditView
- [ ] Submitting or cancelling returns to the previous tab
- [ ] Scrollable content clears the tab bar (pb-tab-bar padding working)
- [ ] Tab bar sits above content on all screens

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: bottom tab navigation, remove header (milestone 1.3)"
```
