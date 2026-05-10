# Milestone 1.2: Form UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the number inputs, emoji library, and datetime field with a drag spinner, inline emoji row, and mode toggle between "From now" and "At time".

**Architecture:** `SpinnerField` is the new primitive — a text input with drag-to-change, chevron tap targets, and focus-select-all. `DurationInput` and `DateTimeInput` both compose it. `EmojiButton` owns an inline emoji popup anchored below itself. `CreateEditView` adds a mode toggle and wires everything together. No schema or store changes — UI only.

**Tech Stack:** React 19, Tailwind CSS 4, existing Dexie/Zustand/Vitest stack. Remove `emoji-picker-react`.

---

## File Structure

```
src/
├── components/
│   ├── SpinnerField.tsx       # NEW: drag+chevron numeric input; exports applyBounds
│   ├── EmojiButton.tsx        # NEW: emoji trigger button + inline scrollable popup
│   ├── DateTimeInput.tsx      # NEW: two rows of SpinnerFields for date and time
│   ├── DurationInput.tsx      # MODIFY: rewire to use SpinnerField × 4
│   ├── CreateEditView.tsx     # MODIFY: mode toggle, new components, no flag field
│   └── TimerCard.tsx          # MODIFY: remove ⚑ flag display
├── lib/
│   └── duration.ts            # MODIFY: add seconds to DurationValue + functions
└── test/
    ├── duration.test.ts       # MODIFY: update for seconds signature
    └── spinnerField.test.ts   # NEW: tests for applyBounds
```

---

### Task 1: Duration utility — add seconds (TDD)

**Files:**
- Modify: `src/lib/duration.ts`
- Modify: `src/test/duration.test.ts`

- [ ] **Step 1: Update the failing tests first**

Replace `src/test/duration.test.ts` entirely:

```ts
import { durationToMs, msToDuration } from '../lib/duration'

describe('durationToMs', () => {
  it('converts days hours minutes seconds to ms', () => {
    expect(durationToMs(1, 2, 30, 15)).toBe((86400 + 7200 + 1800 + 15) * 1000)
  })

  it('returns 0 for all zeros', () => {
    expect(durationToMs(0, 0, 0, 0)).toBe(0)
  })

  it('handles seconds only', () => {
    expect(durationToMs(0, 0, 0, 30)).toBe(30_000)
  })

  it('handles minutes only', () => {
    expect(durationToMs(0, 0, 5, 0)).toBe(300_000)
  })
})

describe('msToDuration', () => {
  it('converts ms to days hours minutes seconds', () => {
    expect(msToDuration((86400 + 7200 + 1800 + 15) * 1000)).toEqual({
      days: 1, hours: 2, minutes: 30, seconds: 15,
    })
  })

  it('returns zeros for 0 ms', () => {
    expect(msToDuration(0)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 })
  })

  it('truncates sub-second ms', () => {
    expect(msToDuration(1500)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 1 })
  })

  it('round-trips through durationToMs', () => {
    const original = { days: 2, hours: 3, minutes: 45, seconds: 20 }
    expect(
      msToDuration(durationToMs(original.days, original.hours, original.minutes, original.seconds))
    ).toEqual(original)
  })
})
```

- [ ] **Step 2: Run — verify fails**

```bash
npx vitest run src/test/duration.test.ts
```
Expected: FAIL — argument count mismatch and missing `seconds` in returned object.

- [ ] **Step 3: Update `src/lib/duration.ts`**

```ts
export interface DurationValue {
  days: number
  hours: number
  minutes: number
  seconds: number
}

export function durationToMs(days: number, hours: number, minutes: number, seconds: number): number {
  return (days * 86400 + hours * 3600 + minutes * 60 + seconds) * 1000
}

export function msToDuration(ms: number): DurationValue {
  const totalSeconds = Math.floor(ms / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return { days, hours, minutes, seconds }
}
```

- [ ] **Step 4: Run — verify passes**

```bash
npx vitest run src/test/duration.test.ts
```
Expected: 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/duration.ts src/test/duration.test.ts
git commit -m "feat: duration utility — add seconds to DurationValue, durationToMs, msToDuration"
```

---

### Task 2: SpinnerField component (TDD)

**Files:**
- Create: `src/components/SpinnerField.tsx`
- Create: `src/test/spinnerField.test.ts`

- [ ] **Step 1: Write failing tests for `applyBounds`**

Create `src/test/spinnerField.test.ts`:

```ts
import { applyBounds } from '../components/SpinnerField'

describe('applyBounds — wrap mode', () => {
  it('wraps above max', () => {
    expect(applyBounds(60, 0, 59, false)).toBe(0)
  })

  it('wraps below min', () => {
    expect(applyBounds(-1, 0, 59, false)).toBe(59)
  })

  it('wraps multiple steps above max', () => {
    expect(applyBounds(62, 0, 59, false)).toBe(2)
  })

  it('returns value within range unchanged', () => {
    expect(applyBounds(30, 0, 59, false)).toBe(30)
  })

  it('wraps non-zero min range', () => {
    expect(applyBounds(13, 1, 12, false)).toBe(1)
    expect(applyBounds(0, 1, 12, false)).toBe(12)
  })
})

describe('applyBounds — clamp mode', () => {
  it('clamps above max', () => {
    expect(applyBounds(100, 0, 10, true)).toBe(10)
  })

  it('clamps below min', () => {
    expect(applyBounds(-5, 0, 10, true)).toBe(0)
  })

  it('returns value within range unchanged', () => {
    expect(applyBounds(5, 0, 10, true)).toBe(5)
  })
})
```

- [ ] **Step 2: Run — verify fails**

```bash
npx vitest run src/test/spinnerField.test.ts
```
Expected: FAIL — `applyBounds` not found.

- [ ] **Step 3: Create `src/components/SpinnerField.tsx`**

```tsx
import { useRef } from 'react'

export function applyBounds(value: number, min: number, max: number, clamp: boolean): number {
  if (clamp) return Math.min(max, Math.max(min, value))
  const range = max - min + 1
  return ((value - min) % range + range) % range + min
}

interface SpinnerFieldProps {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  clamp?: boolean
  label: string
}

export function SpinnerField({ value, onChange, min, max, clamp = false, label }: SpinnerFieldProps) {
  const dragRef = useRef<{ y: number; value: number } | null>(null)

  const apply = (v: number) => onChange(applyBounds(v, min, max, clamp))

  return (
    <div className="flex flex-col items-center flex-1">
      <button
        type="button"
        onClick={() => apply(value + 1)}
        aria-label={`Increase ${label}`}
        className="flex items-center justify-center w-full min-h-[44px] text-slate-400 hover:text-white active:text-white transition-colors text-xl leading-none"
      >
        ⌃
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={String(value).padStart(2, '0')}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const raw = parseInt(e.target.value.replace(/\D/g, ''), 10)
          if (!isNaN(raw)) apply(raw)
        }}
        onPointerDown={(e) => {
          dragRef.current = { y: e.clientY, value }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!dragRef.current) return
          const delta = Math.round((dragRef.current.y - e.clientY) / 8)
          if (delta !== 0) {
            e.currentTarget.blur()
            apply(dragRef.current.value + delta)
          }
        }}
        onPointerUp={() => { dragRef.current = null }}
        onPointerCancel={() => { dragRef.current = null }}
        aria-label={label}
        className="w-full text-center text-2xl font-mono text-white bg-slate-700 rounded-lg py-3 cursor-ns-resize select-none"
      />
      <button
        type="button"
        onClick={() => apply(value - 1)}
        aria-label={`Decrease ${label}`}
        className="flex items-center justify-center w-full min-h-[44px] text-slate-400 hover:text-white active:text-white transition-colors text-xl leading-none"
      >
        ⌄
      </button>
      <span className="text-xs text-slate-500 mt-0.5">{label}</span>
    </div>
  )
}
```

- [ ] **Step 4: Run — verify passes**

```bash
npx vitest run src/test/spinnerField.test.ts
```
Expected: 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/SpinnerField.tsx src/test/spinnerField.test.ts
git commit -m "feat: SpinnerField — drag+chevron numeric input with wrap/clamp"
```

---

### Task 3: DurationInput — rewire to SpinnerField

**Files:**
- Modify: `src/components/DurationInput.tsx`

- [ ] **Step 1: Rewrite `src/components/DurationInput.tsx`**

```tsx
import { SpinnerField } from './SpinnerField'
import type { DurationValue } from '../lib/duration'

interface Props {
  value: DurationValue
  onChange: (v: DurationValue) => void
}

export function DurationInput({ value, onChange }: Props) {
  return (
    <div className="flex gap-2">
      <SpinnerField
        value={value.days}
        onChange={(days) => onChange({ ...value, days })}
        min={0} max={999} clamp
        label="Days"
      />
      <SpinnerField
        value={value.hours}
        onChange={(hours) => onChange({ ...value, hours })}
        min={0} max={23}
        label="Hours"
      />
      <SpinnerField
        value={value.minutes}
        onChange={(minutes) => onChange({ ...value, minutes })}
        min={0} max={59}
        label="Mins"
      />
      <SpinnerField
        value={value.seconds}
        onChange={(seconds) => onChange({ ...value, seconds })}
        min={0} max={59}
        label="Secs"
      />
    </div>
  )
}
```

- [ ] **Step 2: Run all tests — verify no regressions**

```bash
npx vitest run
```
Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/DurationInput.tsx
git commit -m "feat: DurationInput — rewire to SpinnerField with seconds field"
```

---

### Task 4: EmojiButton component

**Files:**
- Create: `src/components/EmojiButton.tsx`

- [ ] **Step 1: Create `src/components/EmojiButton.tsx`**

```tsx
import { useState } from 'react'

const CURATED_EMOJIS = [
  '🏃', '🚴', '🏋️', '🧘', '🚶', '💪', '🎯', '⚽',
  '🍕', '🍎', '🥗', '☕', '💧', '🍜', '🥤', '🍳',
  '💊', '🩺', '😴', '🛁', '🪥', '❤️', '🧠', '🌡️',
  '📚', '💻', '✉️', '📞', '🗓️', '📝', '💡', '🔔',
  '⏰', '⏳', '🔥', '⭐', '🎉', '🧹', '🛒', '🌙',
  '🎵', '🎮', '🐕', '🌿', '🚗', '✈️', '🏠', '💰',
]

interface Props {
  value: string
  onChange: (emoji: string) => void
}

export function EmojiButton({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Pick emoji"
        className="w-[52px] h-[52px] flex items-center justify-center rounded-lg bg-slate-700 text-2xl hover:bg-slate-600 active:scale-95 transition-all shrink-0"
      >
        {value || '🙂+'}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-0 z-50 mt-1 bg-slate-800 border border-slate-600 rounded-xl p-2 shadow-xl overflow-x-auto max-w-[90vw]">
            <div className="flex gap-1" style={{ width: 'max-content' }}>
              {CURATED_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => { onChange(emoji); setOpen(false) }}
                  className="w-10 h-10 flex items-center justify-center text-2xl rounded-lg hover:bg-slate-700 active:scale-90 transition-all shrink-0"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run all tests — verify no regressions**

```bash
npx vitest run
```
Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/EmojiButton.tsx
git commit -m "feat: EmojiButton — inline emoji popup with curated scrollable row"
```

---

### Task 5: DateTimeInput component

**Files:**
- Create: `src/components/DateTimeInput.tsx`

- [ ] **Step 1: Create `src/components/DateTimeInput.tsx`**

```tsx
import { useState } from 'react'
import { SpinnerField } from './SpinnerField'

interface Props {
  initial: Date
  onChange: (date: Date) => void
}

export function DateTimeInput({ initial, onChange }: Props) {
  const currentYear = new Date().getFullYear()

  const [month, setMonth] = useState(initial.getMonth() + 1)
  const [day, setDay] = useState(initial.getDate())
  const [year, setYear] = useState(initial.getFullYear())
  const [hour, setHour] = useState(initial.getHours())
  const [minute, setMinute] = useState(initial.getMinutes())
  const [second, setSecond] = useState(initial.getSeconds())

  const emit = (m: number, d: number, y: number, h: number, min: number, s: number) => {
    onChange(new Date(y, m - 1, d, h, min, s))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <SpinnerField value={month} onChange={(v) => { setMonth(v); emit(v, day, year, hour, minute, second) }} min={1} max={12} label="Month" />
        <SpinnerField value={day}   onChange={(v) => { setDay(v);   emit(month, v, year, hour, minute, second) }} min={1} max={31} label="Day"   />
        <SpinnerField value={year}  onChange={(v) => { setYear(v);  emit(month, day, v, hour, minute, second) }} min={currentYear} max={currentYear + 10} clamp label="Year"  />
      </div>
      <div className="flex gap-2">
        <SpinnerField value={hour}   onChange={(v) => { setHour(v);   emit(month, day, year, v, minute, second) }} min={0} max={23} label="Hour"   />
        <SpinnerField value={minute} onChange={(v) => { setMinute(v); emit(month, day, year, hour, v, second) }} min={0} max={59} label="Min"    />
        <SpinnerField value={second} onChange={(v) => { setSecond(v); emit(month, day, year, hour, minute, v) }} min={0} max={59} label="Sec"    />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run all tests — verify no regressions**

```bash
npx vitest run
```
Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/DateTimeInput.tsx
git commit -m "feat: DateTimeInput — date and time spinner rows using SpinnerField"
```

---

### Task 6: CreateEditView — mode toggle, new components, remove flag

**Files:**
- Modify: `src/components/CreateEditView.tsx`

- [ ] **Step 1: Rewrite `src/components/CreateEditView.tsx`**

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

type TimerMode = 'from-now' | 'at-time'

interface Props {
  existing?: Timer
  onDone: () => void
}

export function CreateEditView({ existing, onDone }: Props) {
  const [title, setTitle] = useState(existing?.title ?? '')
  const [emoji, setEmoji] = useState(existing?.emoji ?? '')
  const [priority, setPriority] = useState<Priority>(existing?.priority ?? 'medium')
  const [mode, setMode] = useState<TimerMode>('from-now')
  const [duration, setDuration] = useState<DurationValue>(() => {
    if (existing) return msToDuration(timeRemaining(existing.targetDatetime))
    return { days: 0, hours: 0, minutes: 5, seconds: 0 }
  })
  const [atTime, setAtTime] = useState<Date>(existing?.targetDatetime ?? new Date())

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const targetDatetime = mode === 'from-now'
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

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-4">
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
          onClick={() => setMode('from-now')}
          className={`flex-1 py-3 text-base font-medium transition-colors ${mode === 'from-now' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}
        >
          From now
        </button>
        <button
          type="button"
          onClick={() => setMode('at-time')}
          className={`flex-1 py-3 text-base font-medium transition-colors ${mode === 'at-time' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}
        >
          At time
        </button>
      </div>

      {mode === 'from-now'
        ? <DurationInput value={duration} onChange={setDuration} />
        : <DateTimeInput initial={atTime} onChange={setAtTime} />
      }

      <div className="flex flex-col gap-1">
        <label htmlFor="timer-priority" className="text-sm text-slate-400">Priority</label>
        <select
          id="timer-priority"
          className="rounded-lg p-3 bg-slate-700 text-white text-base min-h-[52px]"
          value={priority}
          onChange={(e) => { if (isPriority(e.target.value)) setPriority(e.target.value) }}
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
    </form>
  )
}
```

- [ ] **Step 2: Run all tests — verify no regressions**

```bash
npx vitest run
```
Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/CreateEditView.tsx
git commit -m "feat: CreateEditView — mode toggle, SpinnerField inputs, inline emoji, no flag field"
```

---

### Task 7: TimerCard cleanup + remove emoji-picker-react

**Files:**
- Modify: `src/components/TimerCard.tsx`
- Modify: `package.json` (via npm uninstall)

- [ ] **Step 1: Remove flag display from `src/components/TimerCard.tsx`**

Remove the line:
```tsx
{timer.isFlagged && <span className="text-amber-400 text-xl">⚑</span>}
```

The button row becomes:
```tsx
<div className="flex items-center gap-3 mt-1">
  <button
    onClick={() => { if (timer.id !== undefined) completeTimer(timer.id) }}
    className="flex-1 py-3 rounded-xl bg-green-700 text-white text-base font-medium min-h-[48px] hover:bg-green-600 active:scale-95 transition-all"
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
</div>
```

- [ ] **Step 2: Uninstall emoji-picker-react**

```bash
npm uninstall emoji-picker-react
```

- [ ] **Step 3: Run all tests and type-check**

```bash
npx vitest run
npm run build
```
Expected: all tests PASS, build clean with no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/TimerCard.tsx package.json package-lock.json
git commit -m "chore: remove flag display from TimerCard; uninstall emoji-picker-react"
```

---

### Task 8: Final verify

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```
Expected: all test files PASS — `db.test.ts`, `countdown.test.ts`, `timerStore.test.ts`, `duration.test.ts`, `spinnerField.test.ts`.

- [ ] **Step 2: Build**

```bash
npm run build
```
Expected: no type errors, clean build to `dist/`.

- [ ] **Step 3: Manual UAT checklist**

Start `npm run dev` and verify:

1. **Title + emoji button** — emoji button sits flush to the right of the title field; default shows `🙂+`
2. **Emoji popup** — tapping the button opens a single-row scrollable emoji strip below it; tapping outside closes it; selecting an emoji replaces the button label
3. **Mode toggle** — "From now" / "At time" pill toggle works; switching swaps the input area
4. **From now spinners** — Days / Hours / Mins / Secs fields show with ⌃ / ⌄ chevrons; dragging up increases value, down decreases; hours/mins/secs wrap, days clamp ≥ 0; tapping the number focuses it and selects all
5. **At time spinners** — Month / Day / Year row and Hour / Min / Sec row; year clamps ≥ current year
6. **No flag field** — flag checkbox is gone from the form; ⚑ is gone from timer cards

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: milestone 1.2 complete — SpinnerField, emoji row, mode toggle"
```
