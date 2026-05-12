# Drop Button & Early History Timing Design

**Date:** 2026-05-12

## Overview

Two related features:

1. **Drop button** — adds a cancel action to `TimerCard` with an inline two-step confirmation. When overdue, Edit is hidden and only Done and Drop remain.
2. **Early timing rule** — replaces the binary "any ms early = early" rule with a proportional threshold: completing a timer with >10% of its original duration remaining counts as early. Deadline extensions (allowed once) are surfaced transparently in the history annotation.

## Schema Changes (`src/db/schema.ts`)

Add `originalTargetDatetime: Date` to the `Timer` interface. This field is set equal to `targetDatetime` at creation and **never updated** by edits. It is the permanent record of the original commitment.

## Data Layer (`src/hooks/useTimers.ts`)

**`createTimer`** — sets `originalTargetDatetime: data.targetDatetime` alongside `createdAt`/`updatedAt`. Update the `Omit` type to exclude `originalTargetDatetime` from the caller-supplied fields.

**`cancelTimer(id)`** — new function, identical shape to `completeTimer`, sets `status: "cancelled"` and `updatedAt: new Date()`.

**`editTimer`** — enforce the one-extension rule: if `newTargetDatetime > current.targetDatetime` and `current.targetDatetime > current.originalTargetDatetime`, reject the update (already extended once). Reducing the deadline is always allowed. The function must read the current timer from Dexie before writing to perform this check.

## `getHistoryAnnotation` (`src/lib/countdown.ts`)

**Signature change** — add `originalTargetDatetime: Date` and `createdAt: Date` parameters:

```ts
getHistoryAnnotation(
  targetDatetime: Date,
  updatedAt: Date,
  originalTargetDatetime: Date,
  createdAt: Date,
): { text: string; timing: HistoryTiming; extensionText?: string }
```

**Logic:**

```
diffMs          = targetDatetime - updatedAt          // time vs current deadline
totalDuration   = originalTargetDatetime - createdAt  // original intended duration
extensionMs     = targetDatetime - originalTargetDatetime  // >0 if deadline was extended

timing:
  diffMs > totalDuration * 0.10  → Early
  diffMs < 0                     → Overdue
  otherwise                      → OnTime

text:
  Early   → formatDuration(diffMs) + " remaining"
  OnTime  → "On time"
  Overdue → formatDuration(-diffMs) + " overdue"

extensionText (only when extensionMs > 0):
  "after " + formatDuration(extensionMs) + " extension"
```

Edge case: if `totalDuration <= 0` (timer target set at or before creation), fall back to `diffMs > 0` for the Early check.

## `HistoryView` (`src/components/HistoryView.tsx`)

- Pass `timer.originalTargetDatetime` and `timer.createdAt` to `getHistoryAnnotation`.
- When `extensionText` is present, render it as a secondary line below the timing annotation (e.g. `text-xs text-slate-500`).

## `TimerCard` Layout

The button row has four states:

| State | Buttons |
|---|---|
| Active (not overdue) | `Done [flex-1]` · `Edit [flex-1]` · `🗑️ [~48px fixed]` |
| Active + drop armed | `Done [flex-1]` · `Edit [flex-1]` · `DROP? [flex-1, red]` |
| Overdue | `Done [flex-1]` · `🗑️ [~48px fixed]` |
| Overdue + drop armed | `Done [flex-1]` · `DROP? [flex-1, red]` |

- Edit is conditionally rendered (`{!isOverdue && <EditButton />}`), not disabled.
- The trashcan button is compact (icon only, fixed ~48px wide, same height as other buttons).
- When armed, it expands to a full `flex-1` red button labelled `DROP?`.

## Armed State Behaviour

- `dropArmed: boolean` local state in `TimerCard`.
- First tap on 🗑️ → sets `dropArmed = true`, starts a `setTimeout` of 2000ms that resets `dropArmed = false`.
- Second tap on `DROP?` within 2s → calls `cancelTimer(timer.id)`, clears the timeout.
- Timeout ref cleaned up on unmount via `useEffect` return.

## Spinner Cap on Already-Extended Timer (`src/components/DurationInput.tsx`, `CreateEditView.tsx`)

When editing a timer that has already been extended (`existing.targetDatetime > existing.originalTargetDatetime`), increasing the duration is a silent no-op (blocked by `editTimer`). Make the UI honest by capping each spinner at the current remaining time.

- Add `maxValue?: DurationValue` prop to `DurationInput`. When provided:
  - Each `SpinnerField` receives `max={maxValue.<field>}` instead of its default max
  - Each `SpinnerField` receives `clamp={true}` to prevent wrap-around at the cap
- `SpinnerField` requires no changes — it already supports `max` and `clamp` props
- In `CreateEditView`, derive `isAlreadyExtended` and capture the initial duration as the cap:
  ```ts
  const isAlreadyExtended = existing
    ? existing.targetDatetime > existing.originalTargetDatetime
    : false
  ```
  The initial `duration` state (set from `msToDuration(timeRemaining(existing.targetDatetime))`) is already the correct cap value. Pass `maxValue={isAlreadyExtended ? duration : undefined}` to `DurationInput`. Because `duration` is state, this cap reflects the value at form-open and does not change as the user edits.

Scope: "From now" mode only. `DateTimeInput` ("At time" mode) is out of scope.

## Out of Scope

- No confirmation dialog for Drop.
- No undo / restore after drop.
- Edit button behaviour for non-overdue timers is unchanged.
- The 10% threshold is not user-configurable.
- `DateTimeInput` ("At time" mode) spinner disable is out of scope.
