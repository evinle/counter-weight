# Export / Import + useToast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full timer backup/restore feature to SettingsView, backed by a versioned JSON file and a new general-purpose `useToast` hook that replaces the existing timer-specific toast.

**Architecture:** A new `useToast` Zustand store holds a queue of configurable toasts rendered by `ToastContainer` (which replaces `ToastNotification`). A pure `src/lib/backup.ts` module handles serialisation and a version-handler registry for forward-compatible imports. `SettingsView` wires export (anchor download) and import (file picker) to the backup module.

**Tech Stack:** React, Zustand, Dexie (IndexedDB), Tailwind CSS, Vitest

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/hooks/useToast.ts` | Toast Zustand store + `useToast()` hook |
| Create | `src/components/ToastContainer.tsx` | Renders active toasts from store |
| Delete | `src/components/ToastNotification.tsx` | Replaced by ToastContainer |
| Create | `src/lib/backup.ts` | `exportTimers`, `importTimers`, version handler registry |
| Modify | `src/hooks/useTimers.ts` | Add `bulkImportTimers` |
| Modify | `src/components/SettingsView.tsx` | Add export/import buttons |
| Modify | `src/App.tsx` | Replace ToastNotification + firedTimer toast with useToast/ToastContainer |
| Create | `src/test/useToast.test.ts` | Tests for toast store |
| Create | `src/test/backup.test.ts` | Tests for export/import logic |

---

## Task 1: `useToast` hook

**Files:**
- Create: `src/hooks/useToast.ts`
- Create: `src/test/useToast.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/test/useToast.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useToastStore } from '../hooks/useToast'

beforeEach(() => {
  useToastStore.setState({ toasts: [] })
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useToastStore', () => {
  it('adds a toast with default fields applied', () => {
    const { show } = useToastStore.getState()
    show({ message: 'hello' })
    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({
      message: 'hello',
      variant: 'default',
      ttl: 4000,
      position: 'bottom',
    })
    expect(typeof toasts[0].id).toBe('string')
  })

  it('overrides defaults with provided fields', () => {
    const { show } = useToastStore.getState()
    show({ message: 'err', variant: 'error', ttl: 0, position: 'top' })
    const toasts = useToastStore.getState().toasts
    expect(toasts[0]).toMatchObject({ variant: 'error', ttl: 0, position: 'top' })
  })

  it('dismiss removes the toast by id', () => {
    const { show, dismiss } = useToastStore.getState()
    show({ message: 'a' })
    const id = useToastStore.getState().toasts[0].id
    dismiss(id)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('auto-dismisses after ttl ms', () => {
    const { show } = useToastStore.getState()
    show({ message: 'auto', ttl: 2000 })
    expect(useToastStore.getState().toasts).toHaveLength(1)
    vi.advanceTimersByTime(2000)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('does not auto-dismiss when ttl is 0', () => {
    const { show } = useToastStore.getState()
    show({ message: 'sticky', ttl: 0 })
    vi.advanceTimersByTime(99999)
    expect(useToastStore.getState().toasts).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/test/useToast.test.ts
```

Expected: FAIL — `Cannot find module '../hooks/useToast'`

- [ ] **Step 3: Implement `src/hooks/useToast.ts`**

```ts
import { create } from 'zustand'

export interface Toast {
  id: string
  message: string
  variant: 'default' | 'success' | 'error'
  ttl: number
  position: 'top' | 'bottom'
}

type ShowInput = { message: string } & Partial<Omit<Toast, 'id'>>

const DEFAULTS: Omit<Toast, 'id' | 'message'> = {
  variant: 'default',
  ttl: 4000,
  position: 'bottom',
}

interface ToastState {
  toasts: Toast[]
  show: (input: ShowInput) => string
  dismiss: (id: string) => void
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show(input) {
    const id = crypto.randomUUID()
    const toast: Toast = { ...DEFAULTS, ...input, id }
    set({ toasts: [...get().toasts, toast] })
    if (toast.ttl > 0) {
      setTimeout(() => get().dismiss(id), toast.ttl)
    }
    return id
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter(t => t.id !== id) })
  },
}))

export function useToast() {
  const show = useToastStore(s => s.show)
  const dismiss = useToastStore(s => s.dismiss)
  return { show, dismiss }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/test/useToast.test.ts
```

Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useToast.ts src/test/useToast.test.ts
git commit -m "feat: add useToast store with auto-dismiss and sticky support"
```

---

## Task 2: `ToastContainer` component

**Files:**
- Create: `src/components/ToastContainer.tsx`

- [ ] **Step 1: Create `src/components/ToastContainer.tsx`**

```tsx
import { useToastStore } from '../hooks/useToast'
import type { Toast } from '../hooks/useToast'

function toastClasses(variant: Toast['variant']): string {
  if (variant === 'success') return 'bg-green-900 border-green-700'
  if (variant === 'error') return 'bg-red-900 border-red-700'
  return 'bg-slate-900 border-slate-600'
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <div className={`${toastClasses(toast.variant)} border rounded-xl p-4 shadow-xl flex items-center gap-4`}>
      <p className="text-white text-sm flex-1 min-w-0">{toast.message}</p>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-slate-400 text-2xl min-w-[44px] min-h-[44px] flex items-center justify-center active:opacity-60 transition-opacity cursor-pointer"
      >
        ✕
      </button>
    </div>
  )
}

export function ToastContainer() {
  const toasts = useToastStore(s => s.toasts)
  const dismiss = useToastStore(s => s.dismiss)

  const top = toasts.filter(t => t.position === 'top')
  const bottom = toasts.filter(t => t.position === 'bottom')

  return (
    <>
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-40 flex flex-col gap-2 w-full max-w-sm px-4">
        {top.map(t => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
      <div
        className="fixed z-40 flex flex-col-reverse gap-2 w-full max-w-sm px-4 left-1/2 -translate-x-1/2"
        style={{ bottom: 'calc(var(--spacing-bottom-bar-inset) + 1rem)' }}
      >
        {bottom.map(t => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -30
```

Expected: build succeeds (ToastContainer not yet used — that's fine)

- [ ] **Step 3: Commit**

```bash
git add src/components/ToastContainer.tsx
git commit -m "feat: add ToastContainer component"
```

---

## Task 3: Migrate `App.tsx`, delete `ToastNotification.tsx`

**Files:**
- Modify: `src/App.tsx`
- Delete: `src/components/ToastNotification.tsx`

- [ ] **Step 1: Update `src/App.tsx`**

Replace the imports at the top:

```tsx
// Remove this import:
// import { ToastNotification } from "./components/ToastNotification";

// Add these imports:
import { ToastContainer } from "./components/ToastContainer";
import { useToast } from "./hooks/useToast";
```

Inside the `App` component, add `useToast` and update the `firedTimer` effect. The full updated section (remove old `firedTimer`-related state + replace the effect):

```tsx
// Keep these existing lines:
const sync = useTimerStore((s) => s.sync);
const firedTimer = useTimerStore((s) => s.firedTimer);
const dismissFired = useTimerStore((s) => s.dismissFired);

// Add after the existing useTimerStore selectors:
const { show } = useToast();
```

Replace the existing `firedTimer` useEffect (lines 69–86 in the original file) with:

```tsx
useEffect(() => {
  if (!firedTimer) return;
  if ("Notification" in window && Notification.permission === "granted") {
    navigator.serviceWorker.ready.then((reg) => {
      reg.showNotification(firedTimer.title, {
        body: "Timer complete",
        icon: "/icon-192.png",
        tag: String(firedTimer.id),
      });
    });
  }
  if (firedTimer.id !== undefined) {
    db.timers.update(firedTimer.id, {
      status: "fired",
      updatedAt: new Date(),
    });
  }
  show({
    message: `${firedTimer.emoji ?? "⏰"} ${firedTimer.title}`,
    ttl: 0,
    position: "top",
  });
  dismissFired();
}, [firedTimer]);
```

Replace the JSX in the return statement — remove `{firedTimer && <ToastNotification ... />}` and add `<ToastContainer />`:

```tsx
return (
  <div className="h-dvh bg-slate-900 text-white max-w-lg mx-auto overscroll-none">
    <ToastContainer />
    {swDebug && (
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-700 text-slate-200 text-xs px-4 py-2 rounded-lg shadow-lg whitespace-nowrap">
        {swDebug}
      </div>
    )}
    {notifPermission === "default" && activeAction === ActiveAction.None && (
      <div
        className="fixed left-4 right-4 z-40 bg-slate-800 border border-slate-600 rounded-xl p-4 flex items-center justify-between gap-4 shadow-xl"
        style={{ bottom: "calc(var(--spacing-bottom-bar-inset) + 1rem)" }}
      >
        <p className="text-sm text-slate-300">
          Enable notifications for timer alerts
        </p>
        <button
          onClick={requestNotifPermission}
          className="shrink-0 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg active:scale-95 transition-all cursor-pointer"
        >
          Enable
        </button>
      </div>
    )}

    <main className="h-full box-border pt-safe-top pb-bottom-bar">
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
);
```

- [ ] **Step 2: Delete `ToastNotification.tsx`**

```bash
rm src/components/ToastNotification.tsx
```

- [ ] **Step 3: Verify build passes**

```bash
npm run build 2>&1 | head -30
```

Expected: no TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/ToastContainer.tsx
git rm src/components/ToastNotification.tsx
git commit -m "feat: migrate App to useToast + ToastContainer, remove ToastNotification"
```

---

## Task 4: `backup.ts` — export and import with version registry

**Files:**
- Create: `src/lib/backup.ts`
- Create: `src/test/backup.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/test/backup.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { exportTimers, importTimers } from '../lib/backup'
import type { Timer } from '../db/schema'

function makeTimer(overrides: Partial<Timer> = {}): Timer {
  return {
    title: 'Test Timer',
    description: null,
    emoji: '⏰',
    targetDatetime: new Date('2026-06-01T10:00:00.000Z'),
    originalTargetDatetime: new Date('2026-06-01T10:00:00.000Z'),
    status: 'active',
    priority: 'medium',
    isFlagged: false,
    groupId: null,
    recurrenceRule: null,
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    ...overrides,
  }
}

describe('exportTimers', () => {
  it('produces a valid JSON envelope with version 1', () => {
    const json = exportTimers([makeTimer()])
    const parsed = JSON.parse(json)
    expect(parsed.version).toBe(1)
    expect(typeof parsed.exportedAt).toBe('string')
    expect(Array.isArray(parsed.timers)).toBe(true)
    expect(parsed.timers).toHaveLength(1)
  })

  it('serialises dates as ISO strings', () => {
    const json = exportTimers([makeTimer()])
    const parsed = JSON.parse(json)
    const t = parsed.timers[0]
    expect(typeof t.targetDatetime).toBe('string')
    expect(typeof t.createdAt).toBe('string')
    expect(new Date(t.targetDatetime).toISOString()).toBe('2026-06-01T10:00:00.000Z')
  })

  it('includes timers with id field when present', () => {
    const json = exportTimers([makeTimer({ id: 42 })])
    const parsed = JSON.parse(json)
    expect(parsed.timers[0].id).toBe(42)
  })
})

describe('importTimers', () => {
  it('round-trips exported timers back to Timer[]', () => {
    const original = makeTimer({ id: 1 })
    const json = exportTimers([original])
    const { timers, skipped } = importTimers(json)
    expect(skipped).toBe(0)
    expect(timers).toHaveLength(1)
    expect(timers[0].title).toBe('Test Timer')
    expect(timers[0].targetDatetime).toBeInstanceOf(Date)
  })

  it('strips id from imported timers', () => {
    const json = exportTimers([makeTimer({ id: 99 })])
    const { timers } = importTimers(json)
    expect(timers[0].id).toBeUndefined()
  })

  it('handles unknown version as best-effort with handleDefault', () => {
    const envelope = JSON.stringify({
      version: 999,
      exportedAt: new Date().toISOString(),
      timers: [makeTimer({ targetDatetime: new Date('2026-06-01T10:00:00.000Z') })].map(t => ({
        ...t,
        targetDatetime: t.targetDatetime.toISOString(),
        originalTargetDatetime: t.originalTargetDatetime.toISOString(),
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
    })
    const { timers, skipped } = importTimers(envelope)
    expect(timers).toHaveLength(1)
    expect(skipped).toBe(0)
  })

  it('skips records missing required fields and counts them', () => {
    const envelope = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      timers: [
        { title: 'Valid', status: 'active', targetDatetime: '2026-06-01T10:00:00.000Z', priority: 'medium' },
        { title: 'No status' },
        { status: 'active' },
      ],
    })
    const { timers, skipped } = importTimers(envelope)
    expect(timers).toHaveLength(1)
    expect(skipped).toBe(2)
  })

  it('throws on invalid JSON', () => {
    expect(() => importTimers('not json')).toThrow('Invalid JSON file')
  })

  it('throws when version field is missing', () => {
    expect(() => importTimers(JSON.stringify({ timers: [] }))).toThrow('Missing version field')
  })

  it('throws when timers array is missing', () => {
    expect(() => importTimers(JSON.stringify({ version: 1 }))).toThrow('Missing timers array')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/test/backup.test.ts
```

Expected: FAIL — `Cannot find module '../lib/backup'`

- [ ] **Step 3: Implement `src/lib/backup.ts`**

```ts
import type { Timer } from '../db/schema'
import { isTimerStatus, isPriority } from '../db/schema'

export interface ImportResult {
  timers: Timer[]
  skipped: number
}

type VersionHandler = (rawTimers: unknown[]) => Omit<Timer, 'id'>[]

function parseDate(v: unknown): Date | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v
  if (typeof v === 'string') {
    const d = new Date(v)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

function coerceTimer(raw: unknown): Omit<Timer, 'id'> | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  const title = typeof r.title === 'string' && r.title.length > 0 ? r.title : null
  const status = typeof r.status === 'string' && isTimerStatus(r.status) ? r.status : null
  const targetDatetime = parseDate(r.targetDatetime)

  if (!title || !status || !targetDatetime) return null

  return {
    title,
    description: typeof r.description === 'string' ? r.description : null,
    emoji: typeof r.emoji === 'string' ? r.emoji : null,
    targetDatetime,
    originalTargetDatetime: parseDate(r.originalTargetDatetime) ?? targetDatetime,
    status,
    priority: typeof r.priority === 'string' && isPriority(r.priority) ? r.priority : 'medium',
    isFlagged: typeof r.isFlagged === 'boolean' ? r.isFlagged : false,
    groupId: typeof r.groupId === 'number' ? r.groupId : null,
    recurrenceRule:
      r.recurrenceRule &&
      typeof r.recurrenceRule === 'object' &&
      typeof (r.recurrenceRule as Record<string, unknown>).cron === 'string' &&
      typeof (r.recurrenceRule as Record<string, unknown>).tz === 'string'
        ? (r.recurrenceRule as { cron: string; tz: string })
        : null,
    createdAt: parseDate(r.createdAt) ?? new Date(),
    updatedAt: parseDate(r.updatedAt) ?? new Date(),
  }
}

function handleV1(rawTimers: unknown[]): Omit<Timer, 'id'>[] {
  return rawTimers.flatMap(r => {
    const t = coerceTimer(r)
    return t ? [t] : []
  })
}

function handleDefault(rawTimers: unknown[]): Omit<Timer, 'id'>[] {
  return handleV1(rawTimers)
}

const VERSION_HANDLERS: Record<number, VersionHandler> = {
  1: handleV1,
}

function parseTimers(version: number, rawTimers: unknown[]): Omit<Timer, 'id'>[] {
  const handler = VERSION_HANDLERS[version] ?? handleDefault
  return handler(rawTimers)
}

export function exportTimers(timers: Timer[]): string {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      timers: timers.map(t => ({
        ...t,
        targetDatetime: t.targetDatetime.toISOString(),
        originalTargetDatetime: t.originalTargetDatetime.toISOString(),
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
    },
    null,
    2,
  )
}

export function importTimers(json: string): ImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Invalid JSON file')
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid backup file format')
  }

  const envelope = parsed as Record<string, unknown>

  if (typeof envelope.version !== 'number') {
    throw new Error('Missing version field')
  }

  if (!Array.isArray(envelope.timers)) {
    throw new Error('Missing timers array')
  }

  const rawCount = (envelope.timers as unknown[]).length
  const timers = parseTimers(envelope.version, envelope.timers as unknown[]) as Timer[]

  return {
    timers,
    skipped: rawCount - timers.length,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/test/backup.test.ts
```

Expected: PASS — 10 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/backup.ts src/test/backup.test.ts
git commit -m "feat: add backup module with versioned export/import and best-effort default handler"
```

---

## Task 5: `bulkImportTimers` in `useTimers.ts`

**Files:**
- Modify: `src/hooks/useTimers.ts`
- Modify: `src/test/useTimers.test.ts`

- [ ] **Step 1: Write failing test**

Open `src/test/useTimers.test.ts` and add at the end of the file:

```ts
describe('bulkImportTimers', () => {
  it('inserts multiple timers and assigns new ids', async () => {
    const timers: Timer[] = [
      {
        title: 'Imported A',
        description: null,
        emoji: null,
        targetDatetime: new Date('2026-07-01T10:00:00Z'),
        originalTargetDatetime: new Date('2026-07-01T10:00:00Z'),
        status: 'active',
        priority: 'medium',
        isFlagged: false,
        groupId: null,
        recurrenceRule: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]
    await bulkImportTimers(timers)
    const all = await db.timers.toArray()
    expect(all.some(t => t.title === 'Imported A')).toBe(true)
  })
})
```

Also add the import at the top of `src/test/useTimers.test.ts` (alongside existing imports):

```ts
import { bulkImportTimers } from '../hooks/useTimers'
import type { Timer } from '../db/schema'
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/test/useTimers.test.ts
```

Expected: FAIL — `bulkImportTimers is not a function` (or similar export error)

- [ ] **Step 3: Add `bulkImportTimers` to `src/hooks/useTimers.ts`**

Append at the end of the file:

```ts
export async function bulkImportTimers(timers: Timer[]): Promise<void> {
  await db.timers.bulkAdd(timers)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/test/useTimers.test.ts
```

Expected: PASS — all tests including the new one

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTimers.ts src/test/useTimers.test.ts
git commit -m "feat: add bulkImportTimers to useTimers"
```

---

## Task 6: `SettingsView` UI — export and import buttons

**Files:**
- Modify: `src/components/SettingsView.tsx`

- [ ] **Step 1: Replace `src/components/SettingsView.tsx`**

```tsx
import { useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { exportTimers, importTimers } from '../lib/backup'
import { bulkImportTimers } from '../hooks/useTimers'
import { useToast } from '../hooks/useToast'
import { ScreenTitle } from './ScreenTitle'

export function SettingsView() {
  const { show } = useToast()
  const allTimers = useLiveQuery(() => db.timers.toArray(), [], [])
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleExport() {
    const json = exportTimers(allTimers ?? [])
    const date = new Date().toISOString().slice(0, 10)
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `counter-weight-${date}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const { timers, skipped } = importTimers(text)
      await bulkImportTimers(timers)
      const msg =
        skipped > 0
          ? `Imported ${timers.length} timers, ${skipped} could not be read`
          : `Imported ${timers.length} timers`
      show({ message: msg, variant: skipped > 0 ? 'default' : 'success' })
    } catch (err) {
      show({
        message: `Import failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        variant: 'error',
        ttl: 0,
      })
    }
    e.target.value = ''
  }

  return (
    <div className="flex flex-col pb-tab-bar">
      <ScreenTitle title="Settings" />
      <div className="flex flex-col gap-3 p-4">
        <button
          onClick={handleExport}
          className="flex items-center gap-3 bg-slate-800 rounded-xl p-4 active:opacity-70 transition-opacity cursor-pointer w-full text-left"
        >
          <span className="text-2xl">📤</span>
          <span className="text-white font-medium">Export Timers</span>
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-3 bg-slate-800 rounded-xl p-4 active:opacity-70 transition-opacity cursor-pointer w-full text-left"
        >
          <span className="text-2xl">📥</span>
          <span className="text-white font-medium">Import Timers</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleImport}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript and run full test suite**

```bash
npm run build 2>&1 | head -30
npx vitest run
```

Expected: build succeeds, all tests pass

- [ ] **Step 3: Commit**

```bash
git add src/components/SettingsView.tsx
git commit -m "feat: add export/import buttons to SettingsView"
```

---

## Task 7: Full regression check

- [ ] **Step 1: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass

- [ ] **Step 2: Start the dev server and manually verify**

```bash
npm run dev
```

Open the app and check:
1. Settings tab shows Export and Import buttons
2. Export button downloads `counter-weight-YYYY-MM-DD.json`
3. Inspect the file — it should be a valid JSON envelope with `version`, `exportedAt`, `timers`
4. Import the same file back — toast shows "Imported N timers"
5. When a timer fires, a sticky top toast appears and can be dismissed
6. Bottom toasts (from import) appear above the tab bar
