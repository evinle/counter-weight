# Export / Import + useToast Design

**Date:** 2026-05-14
**Status:** Approved

## Overview

Add backup/restore for all timers in the Dexie database, surfaced in `SettingsView`. A versioned JSON file is downloaded via anchor-download on export and read via a file picker on import. A new `useToast` hook replaces the existing `ToastNotification` component with a general-purpose, configurable toast system.

---

## File Format

A versioned JSON envelope:

```json
{
  "version": 1,
  "exportedAt": "2026-05-14T10:00:00.000Z",
  "timers": [ ...Timer objects... ]
}
```

- Dates (`targetDatetime`, `originalTargetDatetime`, `createdAt`, `updatedAt`) serialised as ISO strings.
- `id` is included in the export but stripped on import — Dexie assigns a new auto-incremented id to every inserted timer.
- Filename includes the export date: `counter-weight-2026-05-14.json`.

---

## Data Layer — `src/lib/backup.ts`

Two public functions:

### `exportTimers(timers: Timer[]): string`

Serialises the full timer list into the JSON envelope. Returns the JSON string.

### `importTimers(json: string): ImportResult`

Parses and validates the envelope, dispatches to the appropriate version handler. Each handler returns only the records it could successfully coerce (dropping the rest); `importTimers` computes `skipped` as the difference between the raw input count and the returned timer count. Returns an `ImportResult` with `id` stripped from every timer.

#### Version handler registry

```ts
type VersionHandler = (rawTimers: unknown[]) => Timer[]

const VERSION_HANDLERS: Record<number, VersionHandler> = {
  1: handleV1,
}

function parseTimers(version: number, rawTimers: unknown[]): Timer[] {
  const handler = VERSION_HANDLERS[version] ?? handleDefault
  return handler(rawTimers)
}
```

- **Known version** → its registered handler coerces the shape into valid `Timer[]`, filling missing fields with defaults and dropping unrecognisable records.
- **Unknown version** → `handleDefault` applies best-effort coercion using the current `Timer` interface. Records that cannot be coerced are skipped silently; the count of skipped records is returned alongside the valid list so the UI can warn the user.
- Each handler uses the existing `isTimerStatus` and `isPriority` guards from `src/db/schema.ts`.

#### Return shape from `importTimers`

```ts
interface ImportResult {
  timers: Timer[]
  skipped: number
}
```

---

## Database Layer — `src/hooks/useTimers.ts`

Add alongside existing CRUD helpers:

```ts
async function bulkImportTimers(timers: Timer[]): Promise<void>
```

Calls `db.timers.bulkAdd(timers)`. Dexie's live query in `App.tsx` picks up the new records automatically.

---

## Toast System

### `src/hooks/useToast.ts`

```ts
interface Toast {
  id: string
  message: string
  variant: 'default' | 'success' | 'error'
  ttl: number        // ms until auto-dismiss; 0 = sticky
  position: 'top' | 'bottom'
}
```

Default config (applied when fields are omitted from `show()`):

| Field | Default |
|---|---|
| `variant` | `'default'` |
| `ttl` | `4000` |
| `position` | `'bottom'` |

`useToast()` returns `{ show, dismiss }`:
- `show(partial: { message: string } & Partial<Toast>)` — adds a toast to the queue, schedules auto-dismiss if `ttl > 0`.
- `dismiss(id: string)` — removes a toast immediately.

State lives in a Zustand slice consistent with the existing `timerStore` pattern.

### `src/components/ToastContainer.tsx`

Replaces the current `<ToastNotification>` in `App.tsx`. Renders all active toasts. Toasts at `position: 'top'` stack downward from `top-4`; toasts at `position: 'bottom'` stack upward from `bottom-tab-bar`. Variants map to colour treatments (default: slate, success: green, error: red).

### Migration of existing timer-fired toast

The current `firedTimer` / `dismissFired()` flow in `App.tsx` migrates to `useToast`. When a timer fires, `show({ message: \`${timer.emoji ?? '⏰'} ${timer.title}\`, ttl: 0, position: 'top' })` is called — sticky so the user must dismiss manually, consistent with current behaviour.

---

## SettingsView UI

Replaces the placeholder content with two rows:

| Button | Label | Behaviour |
|---|---|---|
| Export | "Export Timers 📤" | Fetches all timers from Dexie, calls `exportTimers`, triggers anchor download |
| Import | "Import Timers 📥" | Opens hidden `<input type="file" accept=".json">`, reads file, calls `importTimers`, calls `bulkImportTimers`, shows toast |

**Success toast:** `"Imported 12 timers"` — `variant: 'success'`, default ttl/position.

**Partial import warning:** If `skipped > 0`: `"Imported 9 timers, 3 could not be read"` — `variant: 'default'`.

**Error toast:** `"Import failed: <reason>"` — `variant: 'error'`, sticky (`ttl: 0`).

---

## What Is Not Changing

- No new bottom nav tab — export/import lives entirely in Settings.
- No compression or binary format — plain JSON only.
- No conflict resolution beyond ID stripping — every imported timer is always a new record.
- No selective export — always exports all timers regardless of status.
