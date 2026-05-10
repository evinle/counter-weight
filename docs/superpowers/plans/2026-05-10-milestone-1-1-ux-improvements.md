# Milestone 1.1: UX Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the touch-unfriendliness, missing button states, lack of OS notifications, plain-text emoji field, datetime-local input, missing form labels, and small typography identified during UAT of milestone 1.

**Architecture:** Pure UI improvements layered on the existing stack. A new `duration.ts` utility (TDD) provides domain logic for duration-based time entry. `emoji-picker-react` replaces the plain emoji text field. OS notifications fire via the Web Notifications API from an `App.tsx` effect when `firedTimer` changes — the same effect also writes `status: 'fired'` to Dexie so the card disappears from the feed. No schema changes.

**Tech Stack:** React 19, Tailwind CSS 4, `emoji-picker-react`, existing Dexie/Zustand/Vitest stack.

---

## File Structure

```
src/
├── lib/
│   └── duration.ts           # NEW: DurationValue type, durationToMs, msToDuration
├── components/
│   ├── DurationInput.tsx      # NEW: controlled days/hours/minutes input
│   ├── CreateEditView.tsx     # MODIFY: emoji picker, DurationInput, labels, touch sizing
│   ├── TimerCard.tsx          # MODIFY: disabled state, touch targets, font, button states
│   └── ToastNotification.tsx  # MODIFY: dismiss button touch target, font
├── App.tsx                    # MODIFY: OS notification + Dexie 'fired' update on fire
└── test/
    └── duration.test.ts       # NEW: tests for durationToMs and msToDuration
```

---

### Task 1: Duration Utility

**Files:**
- Create: `src/lib/duration.ts`
- Create: `src/test/duration.test.ts`

- [ ] **Step 1: Write failing tests**

`src/test/duration.test.ts`:
```ts
import { durationToMs, msToDuration } from '../lib/duration'

describe('durationToMs', () => {
  it('converts days hours minutes to ms', () => {
    expect(durationToMs(1, 2, 30)).toBe((86400 + 7200 + 1800) * 1000)
  })

  it('returns 0 for all zeros', () => {
    expect(durationToMs(0, 0, 0)).toBe(0)
  })

  it('handles minutes only', () => {
    expect(durationToMs(0, 0, 5)).toBe(300_000)
  })
})

describe('msToDuration', () => {
  it('converts ms to days hours minutes', () => {
    expect(msToDuration((86400 + 7200 + 1800) * 1000)).toEqual({ days: 1, hours: 2, minutes: 30 })
  })

  it('returns zeros for 0 ms', () => {
    expect(msToDuration(0)).toEqual({ days: 0, hours: 0, minutes: 0 })
  })

  it('truncates sub-minute ms', () => {
    expect(msToDuration(90_500)).toEqual({ days: 0, hours: 0, minutes: 1 })
  })

  it('round-trips through durationToMs', () => {
    const original = { days: 2, hours: 3, minutes: 45 }
    expect(msToDuration(durationToMs(original.days, original.hours, original.minutes))).toEqual(original)
  })
})
```

- [ ] **Step 2: Run — verify fails**

```bash
npm run test -- duration.test.ts
```
Expected: FAIL — `../lib/duration` not found.

- [ ] **Step 3: Implement**

`src/lib/duration.ts`:
```ts
export interface DurationValue {
  days: number
  hours: number
  minutes: number
}

export function durationToMs(days: number, hours: number, minutes: number): number {
  return (days * 86400 + hours * 3600 + minutes * 60) * 1000
}

export function msToDuration(ms: number): DurationValue {
  const totalMinutes = Math.floor(ms / 60_000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  return { days, hours, minutes }
}
```

- [ ] **Step 4: Run — verify passes**

```bash
npm run test -- duration.test.ts
```
Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/duration.ts src/test/duration.test.ts
git commit -m "feat: duration utility — durationToMs and msToDuration"
```

---

### Task 2: DurationInput Component

**Files:**
- Create: `src/components/DurationInput.tsx`

- [ ] **Step 1: Implement**

`src/components/DurationInput.tsx`:
```tsx
import type { DurationValue } from '../lib/duration'

interface Props {
  value: DurationValue
  onChange: (v: DurationValue) => void
}

const FIELDS: { key: keyof DurationValue; label: string; max?: number }[] = [
  { key: 'days', label: 'Days' },
  { key: 'hours', label: 'Hours', max: 23 },
  { key: 'minutes', label: 'Minutes', max: 59 },
]

export function DurationInput({ value, onChange }: Props) {
  return (
    <div className="flex gap-3">
      {FIELDS.map(({ key, label, max }) => (
        <div key={key} className="flex-1 flex flex-col gap-1">
          <label className="text-sm text-slate-400">{label}</label>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={max}
            value={value[key]}
            onChange={(e) => {
              const raw = parseInt(e.target.value, 10)
              const clamped = isNaN(raw)
                ? 0
                : max !== undefined
                  ? Math.min(max, Math.max(0, raw))
                  : Math.max(0, raw)
              onChange({ ...value, [key]: clamped })
            }}
            className="rounded-lg p-3 bg-slate-700 text-white text-center text-lg min-h-[52px]"
          />
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/DurationInput.tsx
git commit -m "feat: DurationInput — days/hours/minutes controlled input"
```

---

### Task 3: CreateEditView — Emoji Picker + Duration Input + Labels

**Files:**
- Modify: `src/components/CreateEditView.tsx`

- [ ] **Step 1: Install emoji-picker-react**

```bash
npm install emoji-picker-react
```

- [ ] **Step 2: Rewrite CreateEditView**

`src/components/CreateEditView.tsx`:
```tsx
import { useState } from 'react'
import EmojiPicker, { type EmojiClickData } from 'emoji-picker-react'
import { createTimer, rescheduleTimer } from '../hooks/useTimers'
import { DurationInput } from './DurationInput'
import { durationToMs, msToDuration } from '../lib/duration'
import type { DurationValue } from '../lib/duration'
import { timeRemaining } from '../lib/countdown'
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
  const [showPicker, setShowPicker] = useState(false)
  const [duration, setDuration] = useState<DurationValue>(() => {
    if (existing) return msToDuration(timeRemaining(existing.targetDatetime))
    return { days: 0, hours: 0, minutes: 5 }
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const targetDatetime = new Date(
      Date.now() + durationToMs(duration.days, duration.hours, duration.minutes)
    )

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
    <>
      {showPicker && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
          onClick={() => setShowPicker(false)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <EmojiPicker
              onEmojiClick={(data: EmojiClickData) => {
                setEmoji(data.emoji)
                setShowPicker(false)
              }}
              theme="dark"
            />
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="timer-title" className="text-sm text-slate-400">Title</label>
          <input
            id="timer-title"
            className="rounded-lg p-3 bg-slate-700 text-white text-base placeholder:text-slate-400 min-h-[52px]"
            placeholder="What are you timing?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-slate-400">Emoji</label>
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="rounded-lg p-3 bg-slate-700 text-white text-base text-left min-h-[52px] hover:bg-slate-600 active:scale-95 transition-all"
          >
            {emoji
              ? <span className="text-2xl">{emoji}</span>
              : <span className="text-slate-400">Pick an emoji (optional)</span>
            }
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-slate-400">Time from now</label>
          <DurationInput value={duration} onChange={setDuration} />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="timer-priority" className="text-sm text-slate-400">Priority</label>
          <select
            id="timer-priority"
            className="rounded-lg p-3 bg-slate-700 text-white text-base min-h-[52px]"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
          >
            {(['low', 'medium', 'high', 'critical'] as Priority[]).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-3 text-white text-base cursor-pointer min-h-[44px]">
          <input
            type="checkbox"
            className="w-5 h-5"
            checked={isFlagged}
            onChange={(e) => setIsFlagged(e.target.checked)}
          />
          Flag this timer
        </label>

        <button
          type="submit"
          className="rounded-lg p-4 bg-blue-600 text-white text-base font-semibold min-h-[52px] hover:bg-blue-500 active:scale-95 transition-all"
        >
          {existing ? 'Update Timer' : 'Create Timer'}
        </button>
      </form>
    </>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/CreateEditView.tsx
git commit -m "feat: CreateEditView — emoji picker, duration input, labels, touch sizing"
```

---

### Task 4: TimerCard — Disabled State + Touch Targets + Button States

**Files:**
- Modify: `src/components/TimerCard.tsx`

- [ ] **Step 1: Rewrite TimerCard**

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
    <div className={`rounded-xl p-4 bg-slate-800 flex flex-col gap-2 ${isExpired ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-lg font-medium text-white truncate">
          {timer.emoji && <span className="mr-2">{timer.emoji}</span>}
          {timer.title}
        </span>
        <span className={`text-sm font-semibold uppercase shrink-0 ${PRIORITY_COLOURS[timer.priority]}`}>
          {timer.priority}
        </span>
      </div>

      <span className="text-4xl font-mono text-white tabular-nums tracking-tight">
        {formatDuration(remaining)}
      </span>

      <div className="flex items-center gap-3 mt-1">
        <button
          onClick={() => completeTimer(timer.id!)}
          disabled={isExpired}
          className="flex-1 py-3 rounded-xl bg-green-700 text-white text-base font-medium min-h-[48px] hover:bg-green-600 active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none"
        >
          Done
        </button>
        <button
          onClick={() => onEdit(timer)}
          disabled={isExpired}
          className="flex-1 py-3 rounded-xl bg-slate-600 text-white text-base font-medium min-h-[48px] hover:bg-slate-500 active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none"
        >
          Edit
        </button>
        {timer.isFlagged && <span className="text-amber-400 text-xl">⚑</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/TimerCard.tsx
git commit -m "feat: TimerCard — disabled state, touch targets, button states, larger font"
```

---

### Task 5: OS Notifications + Dexie Fired Update + Header + Toast Polish

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/ToastNotification.tsx`

- [ ] **Step 1: Update App.tsx**

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

  useEffect(() => {
    if (!firedTimer) return
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(firedTimer.title, {
        body: 'Timer complete',
        icon: '/icon-192.png',
      })
    }
    if (firedTimer.id !== undefined) {
      db.timers.update(firedTimer.id, { status: 'fired', updatedAt: new Date() })
    }
  }, [firedTimer])

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
            className="bg-blue-600 text-white px-5 py-3 rounded-xl text-base font-semibold min-h-[48px] hover:bg-blue-500 active:scale-95 transition-all"
          >
            + New
          </button>
        ) : (
          <button
            onClick={() => setView('feed')}
            className="text-slate-400 text-base min-h-[44px] px-3 active:opacity-60 transition-opacity"
          >
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

- [ ] **Step 2: Update ToastNotification**

`src/components/ToastNotification.tsx`:
```tsx
import type { Timer } from '../db/schema'

interface Props {
  timer: Timer
  onDismiss: () => void
}

export function ToastNotification({ timer, onDismiss }: Props) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-40 bg-slate-900 border border-slate-600 rounded-xl p-4 shadow-xl flex items-center gap-4 max-w-sm w-full mx-4">
      <span className="text-3xl">{timer.emoji ?? '⏰'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-white text-base font-semibold truncate">{timer.title}</p>
        <p className="text-slate-400 text-sm">Timer complete</p>
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-slate-400 text-2xl min-w-[44px] min-h-[44px] flex items-center justify-center active:opacity-60 transition-opacity"
      >
        ✕
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx src/components/ToastNotification.tsx
git commit -m "feat: OS notification on timer fire, mark status fired, header and toast polish"
```

---

### Task 6: Verify + Full Test Suite

**Files:** No new files.

- [ ] **Step 1: Run all tests**

```bash
npm run test -- --run
```
Expected: All tests PASS across `db.test.ts`, `countdown.test.ts`, `timerStore.test.ts`, `duration.test.ts`.

- [ ] **Step 2: Type check + build**

```bash
npm run build
```
Expected: No type errors. Builds cleanly to `dist/`.

- [ ] **Step 3: Verify each UAT item in browser**

```bash
npm run dev
```

Open http://localhost:5173 and check each item:

1. **Touch targets** — buttons are min 48px tall, comfortably tappable
2. **Disabled state** — create a timer 5s out; when countdown reaches 00:00:00, Done and Edit go semi-transparent and no longer respond to taps
3. **OS notification** — accept the browser permission prompt; when a timer fires a system notification appears alongside the toast
4. **Emoji picker** — tap "Pick an emoji"; full-screen dark overlay appears with picker at the bottom; selecting an emoji closes the overlay and shows the chosen emoji on the button
5. **Duration input** — form shows Days / Hours / Minutes number fields; set 0/0/1; create; timer appears counting down from ~60s
6. **Edit pre-population** — tap Edit on an existing timer; form shows remaining duration pre-filled
7. **Labels** — every form field has a visible label above it
8. **Font** — countdown numerals are large (4xl), titles and buttons are readable
9. **Button states** — hovering a button lightens it; tapping shows a brief scale-down press

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: milestone 1.1 complete — UX polish pass"
```
