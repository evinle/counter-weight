# Drop Button Design

**Date:** 2026-05-12

## Overview

Add a "Drop" button to `TimerCard` that cancels a timer and records it in history as `cancelled`. Uses an inline two-step confirmation pattern to prevent accidental taps. When a timer is overdue, the Edit button is hidden and only Done and Drop remain.

## Data Layer

Add `cancelTimer(id: number)` to `src/hooks/useTimers.ts`:

- Sets `status: "cancelled"` and `updatedAt: new Date()`
- Identical shape to `completeTimer`

No schema changes required — `cancelled` is already a valid `HistoryStatus`.

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

## Out of Scope

- No confirmation dialog.
- No undo / restore after drop.
- Edit button behaviour for non-overdue timers is unchanged.
