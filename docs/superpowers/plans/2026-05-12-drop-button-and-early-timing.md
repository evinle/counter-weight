# Drop Button & Early History Timing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Drop (cancel) button with inline two-step confirmation to TimerCard, hide Edit when overdue, and replace the binary "any ms early = early" history rule with a proportional 10%-of-original-duration threshold, surfacing deadline extensions transparently.

**Architecture:** Schema gains `originalTargetDatetime` (set at creation, never mutated) to anchor the original commitment. The data layer enforces a one-extension rule in `editTimer`. `getHistoryAnnotation` gains two new params and computes timing proportionally; `HistoryView` renders an optional extension annotation. `TimerCard` adds local `dropArmed` state driving the trashcan → DROP? transition.

**Tech Stack:** TypeScript, Dexie (IndexedDB), React, Vitest, fake-indexeddb

---

## File Map

| File | Change |
|---|---|
| `src/db/schema.ts` | Add `originalTargetDatetime: Date` to `Timer` |
| `src/db/index.ts` | Version bump to 2 with backfill migration |
| `src/hooks/useTimers.ts` | Update `createTimer`, add `cancelTimer`, update `editTimer` |
| `src/lib/countdown.ts` | Update `getHistoryAnnotation` signature and logic |
| `src/components/HistoryView.tsx` | Pass new params, render `extensionText` |
| `src/components/TimerCard.tsx` | Add Drop button with armed state, hide Edit when overdue |
| `src/test/countdown.test.ts` | Update existing tests + add new cases |
| `src/test/useTimers.test.ts` | New file — tests for `cancelTimer`, `createTimer`, `editTimer` |
| `src/test/db.test.ts` | Add `originalTargetDatetime` to fixture objects |

---

### Task 1: Add `originalTargetDatetime` to schema and DB

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/db/index.ts`
- Modify: `src/test/db.test.ts`

- [ ] **Step 1: Add field to Timer interface**

In `src/db/schema.ts`, add `originalTargetDatetime: Date` after `targetDatetime`:

```ts
export interface Timer {
  id?: number
  title: string
  description: string | null
  emoji: string | null
  targetDatetime: Date
  originalTargetDatetime: Date
  status: TimerStatus
  priority: Priority
  isFlagged: boolean
  groupId: number | null
  recurrenceRule: { cron: string; tz: string } | null
  createdAt: Date
  updatedAt: Date
}
```

- [ ] **Step 2: Bump DB version with backfill migration**

In `src/db/index.ts`, add version 2 that backfills existing records:

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
    this.version(2).stores({
      timers: '++id, status, targetDatetime, priority, isFlagged, groupId',
    }).upgrade(tx =>
      tx.table('timers').toCollection().modify((timer: Timer) => {
        if (!timer.originalTargetDatetime) {
          timer.originalTargetDatetime = timer.targetDatetime
        }
      })
    )
  }
}

export const db = new CounterWeightDB()
```

- [ ] **Step 3: Update db.test.ts fixtures**

In `src/test/db.test.ts`, add `originalTargetDatetime` to every `db.timers.add()` call. There are two patterns:

In the first `describe('db')` block, update both `add` calls:
```ts
await db.timers.add({
  title: 'Test timer',
  targetDatetime: new Date(Date.now() + 60_000),
  originalTargetDatetime: new Date(Date.now() + 60_000),
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
```

In the `describe('history query')` block, add to the `base` object:
```ts
const base = {
  originalTargetDatetime: new Date('2026-01-01'),
  priority: 'medium' as const,
  isFlagged: false,
  emoji: null,
  description: null,
  groupId: null,
  recurrenceRule: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/test/db.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts src/db/index.ts src/test/db.test.ts
git commit -m "feat: add originalTargetDatetime to Timer schema with DB migration"
```

---

### Task 2: Add `cancelTimer` and update `createTimer`

**Files:**
- Modify: `src/hooks/useTimers.ts`
- Create: `src/test/useTimers.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/test/useTimers.test.ts`:

```ts
import 'fake-indexeddb/auto'
import { db } from '../db'
import { createTimer, cancelTimer } from '../hooks/useTimers'

const BASE = {
  title: 'Test',
  description: null,
  emoji: null,
  targetDatetime: new Date('2026-06-01T12:00:00Z'),
  status: 'active' as const,
  priority: 'medium' as const,
  isFlagged: false,
  groupId: null,
  recurrenceRule: null,
}

beforeEach(async () => {
  await db.timers.clear()
})

describe('createTimer', () => {
  it('sets originalTargetDatetime equal to targetDatetime', async () => {
    const id = await createTimer(BASE)
    const timer = await db.timers.get(id!)
    expect(timer?.originalTargetDatetime.getTime()).toBe(BASE.targetDatetime.getTime())
  })
})

describe('cancelTimer', () => {
  it('sets status to cancelled', async () => {
    const id = await createTimer(BASE)
    await cancelTimer(id!)
    const timer = await db.timers.get(id!)
    expect(timer?.status).toBe('cancelled')
  })

  it('updates updatedAt', async () => {
    const before = new Date()
    const id = await createTimer(BASE)
    await cancelTimer(id!)
    const timer = await db.timers.get(id!)
    expect(timer?.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/test/useTimers.test.ts
```

Expected: FAIL — `cancelTimer` not exported.

- [ ] **Step 3: Update `createTimer` and add `cancelTimer`**

In `src/hooks/useTimers.ts`, update `createTimer` and add `cancelTimer`:

```ts
export async function createTimer(
  data: Omit<Timer, "id" | "createdAt" | "updatedAt" | "originalTargetDatetime">,
): Promise<number | undefined> {
  const now = new Date();
  return db.timers.add({
    ...data,
    originalTargetDatetime: data.targetDatetime,
    createdAt: now,
    updatedAt: now,
  });
}

export async function cancelTimer(id: number): Promise<void> {
  await db.timers.update(id, { status: "cancelled", updatedAt: new Date() });
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/test/useTimers.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTimers.ts src/test/useTimers.test.ts
git commit -m "feat: add cancelTimer, set originalTargetDatetime in createTimer"
```

---

### Task 3: Enforce one-extension rule in `editTimer`

**Files:**
- Modify: `src/hooks/useTimers.ts`
- Modify: `src/test/useTimers.test.ts`

- [ ] **Step 1: Update the import line at the top of `src/test/useTimers.test.ts`**

Change the import line to include `editTimer`:

```ts
import { createTimer, cancelTimer, editTimer } from '../hooks/useTimers'
```

- [ ] **Step 2: Write failing tests**

Append to `src/test/useTimers.test.ts` (after the existing `describe` blocks):

```ts
describe('editTimer', () => {
  it('allows first deadline extension', async () => {
    const id = await createTimer(BASE)
    const extended = new Date('2026-06-01T14:00:00Z') // 2h later
    await editTimer(id!, { targetDatetime: extended, title: 'Test', emoji: null, priority: 'medium' })
    const timer = await db.timers.get(id!)
    expect(timer?.targetDatetime.getTime()).toBe(extended.getTime())
  })

  it('blocks a second extension', async () => {
    const id = await createTimer(BASE)
    const first = new Date('2026-06-01T14:00:00Z')
    await editTimer(id!, { targetDatetime: first, title: 'Test', emoji: null, priority: 'medium' })
    const second = new Date('2026-06-01T16:00:00Z')
    await editTimer(id!, { targetDatetime: second, title: 'Test', emoji: null, priority: 'medium' })
    const timer = await db.timers.get(id!)
    // targetDatetime should still be `first`, not `second`
    expect(timer?.targetDatetime.getTime()).toBe(first.getTime())
  })

  it('allows reducing the deadline even after an extension', async () => {
    const id = await createTimer(BASE)
    const extended = new Date('2026-06-01T14:00:00Z')
    await editTimer(id!, { targetDatetime: extended, title: 'Test', emoji: null, priority: 'medium' })
    const earlier = new Date('2026-06-01T11:00:00Z')
    await editTimer(id!, { targetDatetime: earlier, title: 'Test', emoji: null, priority: 'medium' })
    const timer = await db.timers.get(id!)
    expect(timer?.targetDatetime.getTime()).toBe(earlier.getTime())
  })
})
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
npx vitest run src/test/useTimers.test.ts
```

Expected: the "blocks a second extension" test fails (currently no guard).

- [ ] **Step 4: Update `editTimer` with one-extension check**

Replace `editTimer` in `src/hooks/useTimers.ts`:

```ts
export async function editTimer(
  id: number,
  params: {
    targetDatetime: Date;
    title: string;
    emoji: string | null;
    priority: Priority;
  },
) {
  const current = await db.timers.get(id);
  if (!current) return;

  const isAlreadyExtended = current.targetDatetime > current.originalTargetDatetime;
  const isExtending = params.targetDatetime > current.targetDatetime;

  if (isAlreadyExtended && isExtending) return;

  await db.timers.update(id, params);
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npx vitest run src/test/useTimers.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useTimers.ts src/test/useTimers.test.ts
git commit -m "feat: enforce one-extension rule in editTimer"
```

---

### Task 4: Update `getHistoryAnnotation` with proportional threshold

**Files:**
- Modify: `src/lib/countdown.ts`
- Modify: `src/test/countdown.test.ts`

- [ ] **Step 1: Update existing tests to new signature**

The existing three `getHistoryAnnotation` tests in `src/test/countdown.test.ts` pass only 2 args. Update them to pass all 4. Since these tests use timers with no meaningful "original duration" (target and original are the same), add `originalTargetDatetime` equal to `target` and `createdAt` as 1 hour before target so `totalDuration = 1h`:

```ts
describe('getHistoryAnnotation', () => {
  // createdAt is 1h before target; originalTargetDatetime == target (no extension)
  const target = new Date('2026-01-01T12:00:00Z')
  const original = new Date('2026-01-01T12:00:00Z')
  const created = new Date('2026-01-01T11:00:00Z') // totalDuration = 60 min

  it('returns Early timing when more than 10% of duration remains', () => {
    const updated = new Date('2026-01-01T11:55:00Z') // 5 min early = 8.3% → OnTime
    // Use 7 min early = 11.7% → Early
    const updated2 = new Date('2026-01-01T11:53:00Z')
    const { timing } = getHistoryAnnotation(target, updated2, original, created)
    expect(timing).toBe(HistoryTiming.Early)
  })

  it('returns OnTime when within 10% of duration (5 min early on 60 min timer)', () => {
    const updated = new Date('2026-01-01T11:55:00Z') // 5 min early = 8.3% → OnTime
    const { timing } = getHistoryAnnotation(target, updated, original, created)
    expect(timing).toBe(HistoryTiming.OnTime)
  })

  it('returns Overdue timing when updatedAt is after target', () => {
    const updated = new Date('2026-01-01T12:10:00Z') // 10 minutes after
    const { text, timing } = getHistoryAnnotation(target, updated, original, created)
    expect(timing).toBe(HistoryTiming.Overdue)
    expect(text).toBe('00:10:00')
  })

  it('returns OnTime timing when updatedAt equals target exactly', () => {
    const { timing } = getHistoryAnnotation(target, target, original, created)
    expect(timing).toBe(HistoryTiming.OnTime)
  })

  it('returns extensionText when deadline was extended', () => {
    const extendedTarget = new Date('2026-01-01T13:00:00Z') // extended 1h
    const updated = new Date('2026-01-01T12:58:00Z') // 2 min before new target
    const { extensionText } = getHistoryAnnotation(extendedTarget, updated, original, created)
    expect(extensionText).toBe('after 01:00:00 extension')
  })

  it('returns no extensionText when deadline was not extended', () => {
    const updated = new Date('2026-01-01T11:53:00Z')
    const { extensionText } = getHistoryAnnotation(target, updated, original, created)
    expect(extensionText).toBeUndefined()
  })

  it('falls back to diffMs > 0 early check when totalDuration is zero', () => {
    const zeroTarget = new Date('2026-01-01T12:00:00Z')
    const zeroCreated = new Date('2026-01-01T12:00:00Z') // totalDuration = 0
    const updatedEarly = new Date('2026-01-01T11:59:00Z')
    const { timing } = getHistoryAnnotation(zeroTarget, updatedEarly, zeroTarget, zeroCreated)
    expect(timing).toBe(HistoryTiming.Early)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/test/countdown.test.ts
```

Expected: FAIL — wrong number of arguments / missing return fields.

- [ ] **Step 3: Update `getHistoryAnnotation` in `src/lib/countdown.ts`**

Replace the existing `getHistoryAnnotation` function:

```ts
const EARLY_THRESHOLD = 0.10

export function getHistoryAnnotation(
  targetDatetime: Date,
  updatedAt: Date,
  originalTargetDatetime: Date,
  createdAt: Date,
): { text: string; timing: HistoryTiming; extensionText?: string } {
  const diffMs = targetDatetime.getTime() - updatedAt.getTime()
  const totalDuration = originalTargetDatetime.getTime() - createdAt.getTime()
  const extensionMs = targetDatetime.getTime() - originalTargetDatetime.getTime()

  const earlyThresholdMs = totalDuration > 0 ? totalDuration * EARLY_THRESHOLD : 0

  let timing: HistoryTiming
  if (diffMs > earlyThresholdMs) {
    timing = HistoryTiming.Early
  } else if (diffMs < 0) {
    timing = HistoryTiming.Overdue
  } else {
    timing = HistoryTiming.OnTime
  }

  const extensionText = extensionMs > 0
    ? `after ${formatDuration(extensionMs)} extension`
    : undefined

  return { text: formatDuration(Math.abs(diffMs)), timing, extensionText }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/test/countdown.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/countdown.ts src/test/countdown.test.ts
git commit -m "feat: proportional early threshold in getHistoryAnnotation"
```

---

### Task 5: Update `HistoryView` to use new `getHistoryAnnotation` params

**Files:**
- Modify: `src/components/HistoryView.tsx`

- [ ] **Step 1: Update the `getHistoryAnnotation` call and render `extensionText`**

Replace the content of `HistoryView.tsx` with:

```tsx
import { useHistoryTimers } from "../hooks/useTimers";
import { ScreenTitle } from "./ScreenTitle";
import { getHistoryAnnotation, HistoryTiming } from "../lib/countdown";
import { isHistoryStatus, type HistoryStatus } from "../db/schema";

const STATUS_LABELS: Record<HistoryStatus, string> = {
  completed: "Completed",
  missed: "Missed",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<HistoryStatus, string> = {
  completed: "text-green-400",
  missed: "text-red-400",
  cancelled: "text-slate-400",
};

const TIMING_COLORS: Record<HistoryTiming, string> = {
  "on-time": "text-slate-400",
  early: "text-green-400",
  overdue: "text-red-400",
};

function formatAnnotation(text: string, timing: HistoryTiming): string {
  switch (timing) {
    case HistoryTiming.Early:
      return `${text} remaining`;
    case HistoryTiming.OnTime:
      return "On time";
    case HistoryTiming.Overdue:
      return `${text} overdue`;
  }
}

export function HistoryView() {
  const timers = useHistoryTimers();

  const renderTimersHistoryContent = () =>
    timers.length === 0 ? (
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <span className="text-5xl mb-3">📋</span>
        <p className="text-sm">No completed timers yet.</p>
      </div>
    ) : (
      <div className="flex flex-col gap-3 p-4 box-border">
        {timers.map((timer) => {
          const { text, timing, extensionText } = getHistoryAnnotation(
            timer.targetDatetime,
            timer.updatedAt,
            timer.originalTargetDatetime,
            timer.createdAt,
          );
          const status = timer.status;
          if (!isHistoryStatus(status))
            return (
              <div
                key={timer.id}
                className="bg-slate-800 rounded-xl p-4 flex flex-col gap-1"
              >
                <div className="flex items-center gap-2">
                  <span className="text-red-500">
                    Invalid timer data: {status}
                  </span>
                </div>
              </div>
            );

          return (
            <div
              key={timer.id}
              className="bg-slate-800 rounded-xl p-4 flex flex-col gap-1"
            >
              <div className="flex items-center gap-2">
                {timer.emoji && <span>{timer.emoji}</span>}
                <span className="font-semibold text-white flex-1 truncate">
                  {timer.title}
                </span>
                <span
                  className={`text-xs font-medium shrink-0 ${STATUS_COLORS[status]}`}
                >
                  {STATUS_LABELS[status]}
                </span>
              </div>
              <p className={`text-xs ${TIMING_COLORS[timing]}`}>
                {formatAnnotation(text, timing)}
              </p>
              {extensionText && (
                <p className="text-xs text-slate-500">{extensionText}</p>
              )}
            </div>
          );
        })}
      </div>
    );

  return (
    <div className="flex flex-col pb-tab-bar h-full">
      <ScreenTitle title="History" />
      {renderTimersHistoryContent()}
    </div>
  );
}
```

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/HistoryView.tsx
git commit -m "feat: show proportional early timing and extension annotation in HistoryView"
```

---

### Task 6: Add Drop button to `TimerCard`

**Files:**
- Modify: `src/components/TimerCard.tsx`

- [ ] **Step 1: Replace `TimerCard.tsx` with Drop button implementation**

```tsx
import { useRef, useState } from 'react'
import { useAnimatedCountdown } from '../hooks/useAnimatedCountdown'
import { formatDuration } from '../lib/countdown'
import { completeTimer, cancelTimer } from '../hooks/useTimers'
import type { Timer, Priority } from '../db/schema'

const PRIORITY_COLOURS: Record<Priority, string> = {
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
  const isOverdue = remaining <= 0
  const [dropArmed, setDropArmed] = useState(false)
  const dropTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function armDrop() {
    setDropArmed(true)
    dropTimeoutRef.current = setTimeout(() => setDropArmed(false), 2000)
  }

  function confirmDrop() {
    if (dropTimeoutRef.current) clearTimeout(dropTimeoutRef.current)
    setDropArmed(false)
    if (timer.id !== undefined) cancelTimer(timer.id)
  }

  return (
    <div className="rounded-xl p-4 bg-slate-800 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-lg font-medium text-white truncate">
          {timer.emoji && <span className="mr-2">{timer.emoji}</span>}
          {timer.title}
        </span>
        <span className={`text-sm font-semibold uppercase shrink-0 ${PRIORITY_COLOURS[timer.priority]}`}>
          {timer.priority}
        </span>
      </div>

      <span className={`text-4xl font-mono tabular-nums tracking-tight ${isOverdue ? 'text-red-400' : 'text-white'}`}>
        {formatDuration(remaining)}
      </span>

      <div className="flex items-center gap-3 mt-1">
        <button
          onClick={() => { if (timer.id !== undefined) completeTimer(timer.id) }}
          className="flex-1 py-3 rounded-xl bg-green-700 text-white text-base font-medium min-h-[48px] hover:bg-green-600 active:scale-95 transition-all cursor-pointer"
        >
          Done
        </button>

        {!isOverdue && (
          <button
            onClick={() => onEdit(timer)}
            className="flex-1 py-3 rounded-xl bg-slate-600 text-white text-base font-medium min-h-[48px] hover:bg-slate-500 active:scale-95 transition-all cursor-pointer"
          >
            Edit
          </button>
        )}

        {dropArmed ? (
          <button
            onClick={confirmDrop}
            className="flex-1 py-3 rounded-xl bg-red-700 text-white text-base font-medium min-h-[48px] hover:bg-red-600 active:scale-95 transition-all cursor-pointer"
          >
            DROP?
          </button>
        ) : (
          <button
            onClick={armDrop}
            className="w-12 py-3 rounded-xl bg-slate-600 text-white text-base font-medium min-h-[48px] hover:bg-slate-500 active:scale-95 transition-all cursor-pointer"
          >
            🗑️
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Start dev server and manually verify**

```bash
npm run dev
```

Check:
- Active timer: Done + Edit + 🗑️ shown
- Tap 🗑️ → becomes DROP? (red, full width replacing 🗑️)
- Wait 2s without tapping → reverts to 🗑️
- Tap 🗑️ then tap DROP? → timer disappears from feed, appears in History as "Cancelled"
- Overdue timer: only Done + 🗑️ shown (no Edit)
- Edit still works for non-overdue timers

- [ ] **Step 4: Commit**

```bash
git add src/components/TimerCard.tsx
git commit -m "feat: Drop button with two-step confirmation, hide Edit when overdue"
```
