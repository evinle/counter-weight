# DateTimeInput Min-Date Constraints Design

**Date:** 2026-05-13

**Goal:** Add a rolling minimum to `DateTimeInput` so the selected time can never be less than 60 seconds from now. If the user leaves the form open and the selected time drifts into the forbidden zone, the value auto-jumps to `now + 60s`. A submit-time guard also catches any past datetime that slips through and shows a toast error.

---

## Architecture

Three small changes, each with one clear responsibility:

| Unit | Change |
|---|---|
| `src/hooks/useMinDate.ts` | New hook — owns the 60-second tick, exposes a live `minDate` |
| `src/hooks/useDatetimeConstraints.ts` | Extended — adds `minDate` param, per-field `*Min` outputs, `constrainMin`, renames `constrain` → `constrainMax` |
| `src/components/DateTimeInput.tsx` | Consumes `minDate` prop, passes per-field mins to `SpinnerField`, applies `constrainMin` in `emit` |
| `src/components/Toast.tsx` | New generic toast component — `message` + `onDismiss`, auto-dismisses after 4s |
| `src/components/CreateEditView.tsx` | Calls `useMinDate()`, passes result to `DateTimeInput`, snaps `atTime` in a `useEffect`, guards submit with a past-datetime check |

---

## `useMinDate` hook

**File:** `src/hooks/useMinDate.ts`

On mount, computes `minDate = new Date(Date.now() + 60_000)` and stores it in state. Sets a `setInterval` of 60 000 ms; each tick replaces `minDate` with a fresh `new Date(Date.now() + 60_000)`. Clears the interval on unmount. No parameters.

```ts
export function useMinDate(): Date
```

---

## `useDatetimeConstraints` changes

**File:** `src/hooks/useDatetimeConstraints.ts`

### Signature

```ts
export function useDatetimeConstraints(
  fields: DateFields,
  maxDate: Date | undefined,
  minDate: Date | undefined,
): DatetimeConstraints
```

### Return type additions

```ts
export interface DatetimeConstraints {
  // existing max fields unchanged …
  yearMin: number;
  monthMin: number;
  dayMin: number;
  hourMin: number;
  minuteMin: number;
  secondMin: number;
  constrainMax: (date: Date) => Date;  // renamed from constrain
  constrainMin: (date: Date) => Date;
}
```

### Per-field min logic

Mirrors the existing `maxDate` logic symmetrically. Computes `atMinYear`, `atMinMonth`, `atMinDay`, `atMinHour`, `atMinMinute` — each true only when all higher-order fields equal the min boundary. Fields are free (natural floor) when any higher-order field is above the min.

Natural floors: `yearMin = currentYear`, `monthMin = 1`, `dayMin = 1`, `hourMin = 0`, `minuteMin = 0`, `secondMin = 0`.

When `minDate` is undefined, all fields return their natural floor.

### `constrainMin(date)`

Raises lower fields when a higher field is at the min boundary — the mirror of `constrainMax`. Applied in `DateTimeInput.emit` after `constrainMax`.

---

## `DateTimeInput` changes

**File:** `src/components/DateTimeInput.tsx`

Adds `minDate?: Date` prop. Passes `minDate` to `useDatetimeConstraints`. Passes per-field `*Min` values as `min` to each `SpinnerField`. In `emit`, applies `constrainMax` then `constrainMin` to the raw date before calling `onChange`.

SpinnerField already accepts `min` — no changes needed there.

---

## `CreateEditView` changes

**File:** `src/components/CreateEditView.tsx`

```ts
const minDate = useMinDate();
```

Passes `minDate` to `DateTimeInput` in the `AtTime` branch.

Auto-jump effect:

```ts
useEffect(() => {
  if (mode === TimerMode.AtTime && atTime < minDate) {
    setAtTime(new Date(minDate));
  }
}, [minDate]);
```

No changes to the `FromNow` / `DurationInput` path.

---

## `Toast` component

**File:** `src/components/Toast.tsx`

A generic floating message toast, styled consistently with `ToastNotification`. Props:

```ts
interface Props {
  message: string;
  onDismiss: () => void;
}
```

Fixed position (top-centre), auto-dismisses after 4 seconds via `setTimeout` in a `useEffect`. Also has a dismiss button. Used by `CreateEditView` for the validation error.

---

## Submit-time guard

The guard lives in `createTimer` and `editTimer` in `src/hooks/useTimers.ts`, immediately before the Dexie write. Both functions throw a typed error if `targetDatetime <= new Date()`:

```ts
if (targetDatetime <= new Date()) {
  throw new Error("TARGET_IN_PAST");
}
```

`CreateEditView.handleSubmit` wraps the DB call in try/catch: on `"TARGET_IN_PAST"` it sets `toastMessage` to "Target time cannot be in the past" and returns. Any other error re-throws.

`toastMessage` is a `string | null` state in `CreateEditView`; when non-null, renders `<Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />`. The guard applies to both `FromNow` and `AtTime` modes.

---

## Testing

- **`useMinDate`**: unit-test with fake timers — verify initial value is ~60s from now, verify it updates after 60s tick.
- **`useDatetimeConstraints`**: extend existing tests with `minDate` cases — per-field min values, `constrainMin` cascade raising, no-minDate defaults.
- **`constrainMax` rename**: existing tests pass with the rename (no behaviour change).
- **Submit guard**: no dedicated test — the guard is a one-liner; covered by manual QA.

No UI tests for layout — constraint logic is fully covered by unit tests.
