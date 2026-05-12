# DateTimeInput Min-Date Constraints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a rolling 60-second minimum to `DateTimeInput`, auto-jump when time advances past the selected value, and guard `createTimer`/`editTimer` against past datetimes with a toast error.

**Architecture:** A new `useMinDate()` hook provides a live `minDate = now + 60s` updated every 60 seconds. `useDatetimeConstraints` is extended with symmetric `minDate` support (per-field `*Min` outputs + `constrainMin` cascade). `DateTimeInput` consumes `minDate` alongside the existing `maxDate`. `CreateEditView` wires `useMinDate()`, auto-jumps `atTime` when the minimum advances, and catches a `"TARGET_IN_PAST"` error thrown by `createTimer`/`editTimer` to show a toast. A generic `Toast` component is added for the error display.

**Tech Stack:** React, TypeScript, Vitest, @testing-library/react

---

## Files

- **Modify:** `src/hooks/useDatetimeConstraints.ts` — rename `constrain` → `constrainMax`, add `minDate` param, per-field `*Min` outputs, `constrainMin`
- **Modify:** `src/test/useDatetimeConstraints.test.ts` — rename `constrain` → `constrainMax`, add `minDate` test cases
- **Create:** `src/hooks/useMinDate.ts` — 60-second tick hook
- **Create:** `src/test/useMinDate.test.ts` — fake-timer unit tests
- **Create:** `src/components/Toast.tsx` — generic auto-dismissing toast
- **Modify:** `src/hooks/useTimers.ts` — throw `"TARGET_IN_PAST"` guard in `createTimer`/`editTimer`
- **Modify:** `src/components/DateTimeInput.tsx` — accept `minDate`, pass `*Min` to spinners, apply `constrainMin` in `emit`
- **Modify:** `src/components/CreateEditView.tsx` — call `useMinDate()`, auto-jump effect, try/catch for toast

---

## Task 1: Rename `constrain` → `constrainMax`

Pure rename — no behaviour change. Gets the rename out of the way before adding new logic.

**Files:**
- Modify: `src/hooks/useDatetimeConstraints.ts`
- Modify: `src/test/useDatetimeConstraints.test.ts`
- Modify: `src/components/DateTimeInput.tsx`

- [ ] **Step 1: Update the hook interface and implementation**

Replace the entire contents of `src/hooks/useDatetimeConstraints.ts`:

```ts
export interface DateFields {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export interface DatetimeConstraints {
  yearMax: number;
  monthMax: number;
  dayMax: number;
  hourMax: number;
  minuteMax: number;
  secondMax: number;
  constrainMax: (date: Date) => Date;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function useDatetimeConstraints(
  fields: DateFields,
  maxDate: Date | undefined,
): DatetimeConstraints {
  const currentYear = new Date().getFullYear();

  if (!maxDate) {
    return {
      yearMax: currentYear + 10,
      monthMax: 12,
      dayMax: daysInMonth(fields.year, fields.month),
      hourMax: 23,
      minuteMax: 59,
      secondMax: 59,
      constrainMax: (d) => d,
    };
  }

  const maxYear = maxDate.getFullYear();
  const maxMonth = maxDate.getMonth() + 1;
  const maxDay = maxDate.getDate();
  const maxHour = maxDate.getHours();
  const maxMinute = maxDate.getMinutes();
  const maxSecond = maxDate.getSeconds();

  const atMaxYear = fields.year === maxYear;
  const atMaxMonth = atMaxYear && fields.month === maxMonth;
  const atMaxDay = atMaxMonth && fields.day === maxDay;
  const atMaxHour = atMaxDay && fields.hour === maxHour;
  const atMaxMinute = atMaxHour && fields.minute === maxMinute;

  function constrainMax(date: Date): Date {
    const y = Math.min(date.getFullYear(), maxYear);
    const m =
      y === maxYear
        ? Math.min(date.getMonth() + 1, maxMonth)
        : date.getMonth() + 1;
    const naturalDayMax = daysInMonth(y, m);
    const dMax =
      y === maxYear && m === maxMonth
        ? Math.min(maxDay, naturalDayMax)
        : naturalDayMax;
    const d = Math.min(date.getDate(), dMax);
    const h =
      y === maxYear && m === maxMonth && d === maxDay
        ? Math.min(date.getHours(), maxHour)
        : date.getHours();
    const min =
      y === maxYear && m === maxMonth && d === maxDay && h === maxHour
        ? Math.min(date.getMinutes(), maxMinute)
        : date.getMinutes();
    const s =
      y === maxYear &&
      m === maxMonth &&
      d === maxDay &&
      h === maxHour &&
      min === maxMinute
        ? Math.min(date.getSeconds(), maxSecond)
        : date.getSeconds();
    return new Date(y, m - 1, d, h, min, s);
  }

  return {
    yearMax: maxYear,
    monthMax: atMaxYear ? maxMonth : 12,
    dayMax: atMaxMonth ? maxDay : daysInMonth(fields.year, fields.month),
    hourMax: atMaxDay ? maxHour : 23,
    minuteMax: atMaxHour ? maxMinute : 59,
    secondMax: atMaxMinute ? maxSecond : 59,
    constrainMax,
  };
}
```

- [ ] **Step 2: Update the test file**

Replace the entire contents of `src/test/useDatetimeConstraints.test.ts`:

```ts
import { useDatetimeConstraints } from "../hooks/useDatetimeConstraints";
import type { DateFields } from "../hooks/useDatetimeConstraints";

// maxDate = 2026-05-15 08:30:15
const maxDate = new Date(2026, 4, 15, 8, 30, 15);

const atMax: DateFields = {
  year: 2026,
  month: 5,
  day: 15,
  hour: 8,
  minute: 30,
  second: 15,
};

describe("useDatetimeConstraints — no maxDate", () => {
  it("returns full defaults", () => {
    const c = useDatetimeConstraints(atMax, undefined);
    expect(c.monthMax).toBe(12);
    expect(c.hourMax).toBe(23);
    expect(c.minuteMax).toBe(59);
    expect(c.secondMax).toBe(59);
  });

  it("constrainMax returns the same date unchanged", () => {
    const { constrainMax } = useDatetimeConstraints(atMax, undefined);
    const d = new Date(2026, 4, 15, 8, 30, 15);
    expect(constrainMax(d).getTime()).toBe(d.getTime());
  });
});

describe("useDatetimeConstraints — per-field maxes", () => {
  it("constrains minute and second when at full boundary", () => {
    const c = useDatetimeConstraints(atMax, maxDate);
    expect(c.minuteMax).toBe(30);
    expect(c.secondMax).toBe(15);
  });

  it("frees minute and second when hour is below max", () => {
    const fields: DateFields = { ...atMax, hour: 7 };
    const c = useDatetimeConstraints(fields, maxDate);
    expect(c.minuteMax).toBe(59);
    expect(c.secondMax).toBe(59);
  });

  it("constrains hour when at max year/month/day", () => {
    const fields: DateFields = { ...atMax, hour: 8, minute: 0, second: 0 };
    const c = useDatetimeConstraints(fields, maxDate);
    expect(c.hourMax).toBe(8);
  });

  it("frees hour when day is below max", () => {
    const fields: DateFields = { ...atMax, day: 14 };
    const c = useDatetimeConstraints(fields, maxDate);
    expect(c.hourMax).toBe(23);
  });

  it("frees all sub-fields when month is below max", () => {
    const fields: DateFields = { ...atMax, month: 4 };
    const c = useDatetimeConstraints(fields, maxDate);
    expect(c.dayMax).toBe(30); // April has 30 days
    expect(c.hourMax).toBe(23);
    expect(c.minuteMax).toBe(59);
  });

  it("yearMax is always capped at maxDate year", () => {
    const c = useDatetimeConstraints(atMax, maxDate);
    expect(c.yearMax).toBe(2026);
  });
});

describe("constrainMax — cascade snapping", () => {
  it("snaps minute when hour is raised to max boundary", () => {
    const fields: DateFields = { ...atMax, hour: 7, minute: 45 };
    const { constrainMax } = useDatetimeConstraints(fields, maxDate);
    const result = constrainMax(new Date(2026, 4, 15, 8, 45, 0));
    expect(result.getHours()).toBe(8);
    expect(result.getMinutes()).toBe(30);
  });

  it("does not snap minute when hour stays below max", () => {
    const fields: DateFields = { ...atMax, hour: 7, minute: 45 };
    const { constrainMax } = useDatetimeConstraints(fields, maxDate);
    const result = constrainMax(new Date(2026, 4, 15, 7, 45, 0));
    expect(result.getMinutes()).toBe(45);
  });

  it("snaps hour and minute when day is raised to max", () => {
    const fields: DateFields = { ...atMax, day: 14, hour: 23, minute: 59 };
    const { constrainMax } = useDatetimeConstraints(fields, maxDate);
    const result = constrainMax(new Date(2026, 4, 15, 23, 59, 0));
    expect(result.getHours()).toBe(8);
    expect(result.getMinutes()).toBe(30);
  });

  it("does not modify a date already within bounds", () => {
    const { constrainMax } = useDatetimeConstraints(atMax, maxDate);
    const d = new Date(2026, 4, 15, 8, 30, 15);
    expect(constrainMax(d).getTime()).toBe(d.getTime());
  });
});
```

- [ ] **Step 3: Update the call site in `DateTimeInput.tsx`**

In `src/components/DateTimeInput.tsx`, replace the destructured `constrain` with `constrainMax` and update the `emit` function:

```tsx
  const {
    yearMax,
    monthMax,
    dayMax,
    hourMax,
    minuteMax,
    secondMax,
    constrainMax,
  } = useDatetimeConstraints(fields, maxDate);

  const emit = (updated: DateFields) => {
    const naturalDayMax = new Date(updated.year, updated.month, 0).getDate();
    const safeDay = Math.min(updated.day, naturalDayMax);
    const raw = new Date(
      updated.year,
      updated.month - 1,
      safeDay,
      updated.hour,
      updated.minute,
      updated.second,
    );
    onChange(constrainMax(raw));
  };
```

- [ ] **Step 4: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass (same count as before, no failures)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useDatetimeConstraints.ts src/test/useDatetimeConstraints.test.ts src/components/DateTimeInput.tsx
git commit -m "refactor: rename constrain to constrainMax in useDatetimeConstraints"
```

---

## Task 2: Extend `useDatetimeConstraints` with `minDate` support

**Files:**
- Modify: `src/hooks/useDatetimeConstraints.ts`
- Modify: `src/test/useDatetimeConstraints.test.ts`

- [ ] **Step 1: Write failing tests for `minDate`**

Append the following to `src/test/useDatetimeConstraints.test.ts` (after the existing test blocks):

```ts
// minDate = 2026-05-10 08:15:30
const minDate = new Date(2026, 4, 10, 8, 15, 30);

const atMin: DateFields = {
  year: 2026,
  month: 5,
  day: 10,
  hour: 8,
  minute: 15,
  second: 30,
};

describe("useDatetimeConstraints — no minDate", () => {
  it("returns natural floor defaults", () => {
    const c = useDatetimeConstraints(atMin, undefined);
    expect(c.monthMin).toBe(1);
    expect(c.dayMin).toBe(1);
    expect(c.hourMin).toBe(0);
    expect(c.minuteMin).toBe(0);
    expect(c.secondMin).toBe(0);
  });

  it("constrainMin returns the same date unchanged", () => {
    const { constrainMin } = useDatetimeConstraints(atMin, undefined);
    const d = new Date(2026, 4, 10, 8, 15, 30);
    expect(constrainMin(d).getTime()).toBe(d.getTime());
  });
});

describe("useDatetimeConstraints — per-field mins", () => {
  it("constrains minute and second when at full min boundary", () => {
    const c = useDatetimeConstraints(atMin, undefined, minDate);
    expect(c.minuteMin).toBe(15);
    expect(c.secondMin).toBe(30);
  });

  it("frees minute and second when hour is above min", () => {
    const fields: DateFields = { ...atMin, hour: 9 };
    const c = useDatetimeConstraints(fields, undefined, minDate);
    expect(c.minuteMin).toBe(0);
    expect(c.secondMin).toBe(0);
  });

  it("constrains hour when at min year/month/day", () => {
    const fields: DateFields = { ...atMin, hour: 8, minute: 0, second: 0 };
    const c = useDatetimeConstraints(fields, undefined, minDate);
    expect(c.hourMin).toBe(8);
  });

  it("frees hour when day is above min", () => {
    const fields: DateFields = { ...atMin, day: 11 };
    const c = useDatetimeConstraints(fields, undefined, minDate);
    expect(c.hourMin).toBe(0);
  });

  it("frees all sub-fields when month is above min", () => {
    const fields: DateFields = { ...atMin, month: 6 };
    const c = useDatetimeConstraints(fields, undefined, minDate);
    expect(c.hourMin).toBe(0);
    expect(c.minuteMin).toBe(0);
    expect(c.secondMin).toBe(0);
  });

  it("yearMin equals minDate year", () => {
    const c = useDatetimeConstraints(atMin, undefined, minDate);
    expect(c.yearMin).toBe(2026);
  });
});

describe("constrainMin — cascade raising", () => {
  it("raises minute when hour drops to min boundary", () => {
    // fields at hour=9 (above min), minute=5
    const fields: DateFields = { ...atMin, hour: 9, minute: 5 };
    const { constrainMin } = useDatetimeConstraints(fields, undefined, minDate);
    // new date drops hour to 8 (at min), minute=5 (below min of 15)
    const result = constrainMin(new Date(2026, 4, 10, 8, 5, 0));
    expect(result.getHours()).toBe(8);
    expect(result.getMinutes()).toBe(15);
  });

  it("does not raise minute when hour stays above min", () => {
    const fields: DateFields = { ...atMin, hour: 9, minute: 5 };
    const { constrainMin } = useDatetimeConstraints(fields, undefined, minDate);
    const result = constrainMin(new Date(2026, 4, 10, 9, 5, 0));
    expect(result.getMinutes()).toBe(5);
  });

  it("raises hour and minute when day drops to min", () => {
    const fields: DateFields = { ...atMin, day: 11, hour: 0, minute: 0 };
    const { constrainMin } = useDatetimeConstraints(fields, undefined, minDate);
    const result = constrainMin(new Date(2026, 4, 10, 0, 0, 0));
    expect(result.getHours()).toBe(8);
    expect(result.getMinutes()).toBe(15);
  });

  it("does not modify a date already at or above min", () => {
    const { constrainMin } = useDatetimeConstraints(atMin, undefined, minDate);
    const d = new Date(2026, 4, 10, 8, 15, 30);
    expect(constrainMin(d).getTime()).toBe(d.getTime());
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/test/useDatetimeConstraints.test.ts
```

Expected: FAIL — `constrainMin` / `minuteMin` / `secondMin` etc. not on the returned object

- [ ] **Step 3: Implement `minDate` support in the hook**

Replace the entire contents of `src/hooks/useDatetimeConstraints.ts`:

```ts
export interface DateFields {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export interface DatetimeConstraints {
  yearMax: number;
  monthMax: number;
  dayMax: number;
  hourMax: number;
  minuteMax: number;
  secondMax: number;
  yearMin: number;
  monthMin: number;
  dayMin: number;
  hourMin: number;
  minuteMin: number;
  secondMin: number;
  constrainMax: (date: Date) => Date;
  constrainMin: (date: Date) => Date;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function useDatetimeConstraints(
  fields: DateFields,
  maxDate: Date | undefined,
  minDate?: Date,
): DatetimeConstraints {
  const currentYear = new Date().getFullYear();

  // ── Max constraints ────────────────────────────────────────────────────────
  let yearMax = currentYear + 10;
  let monthMax = 12;
  let dayMax = daysInMonth(fields.year, fields.month);
  let hourMax = 23;
  let minuteMax = 59;
  let secondMax = 59;
  let constrainMax = (d: Date) => d;

  if (maxDate) {
    const maxYear = maxDate.getFullYear();
    const maxMonth = maxDate.getMonth() + 1;
    const maxDay = maxDate.getDate();
    const maxHour = maxDate.getHours();
    const maxMinute = maxDate.getMinutes();
    const maxSecond = maxDate.getSeconds();

    const atMaxYear = fields.year === maxYear;
    const atMaxMonth = atMaxYear && fields.month === maxMonth;
    const atMaxDay = atMaxMonth && fields.day === maxDay;
    const atMaxHour = atMaxDay && fields.hour === maxHour;
    const atMaxMinute = atMaxHour && fields.minute === maxMinute;

    yearMax = maxYear;
    monthMax = atMaxYear ? maxMonth : 12;
    dayMax = atMaxMonth ? maxDay : daysInMonth(fields.year, fields.month);
    hourMax = atMaxDay ? maxHour : 23;
    minuteMax = atMaxHour ? maxMinute : 59;
    secondMax = atMaxMinute ? maxSecond : 59;

    constrainMax = (date: Date): Date => {
      const y = Math.min(date.getFullYear(), maxYear);
      const m =
        y === maxYear
          ? Math.min(date.getMonth() + 1, maxMonth)
          : date.getMonth() + 1;
      const naturalDayMax = daysInMonth(y, m);
      const dMax =
        y === maxYear && m === maxMonth
          ? Math.min(maxDay, naturalDayMax)
          : naturalDayMax;
      const d = Math.min(date.getDate(), dMax);
      const h =
        y === maxYear && m === maxMonth && d === maxDay
          ? Math.min(date.getHours(), maxHour)
          : date.getHours();
      const min =
        y === maxYear && m === maxMonth && d === maxDay && h === maxHour
          ? Math.min(date.getMinutes(), maxMinute)
          : date.getMinutes();
      const s =
        y === maxYear &&
        m === maxMonth &&
        d === maxDay &&
        h === maxHour &&
        min === maxMinute
          ? Math.min(date.getSeconds(), maxSecond)
          : date.getSeconds();
      return new Date(y, m - 1, d, h, min, s);
    };
  }

  // ── Min constraints ────────────────────────────────────────────────────────
  let yearMin = currentYear;
  let monthMin = 1;
  let dayMin = 1;
  let hourMin = 0;
  let minuteMin = 0;
  let secondMin = 0;
  let constrainMin = (d: Date) => d;

  if (minDate) {
    const minYear = minDate.getFullYear();
    const minMonth = minDate.getMonth() + 1;
    const minDay = minDate.getDate();
    const minHour = minDate.getHours();
    const minMinute = minDate.getMinutes();
    const minSecond = minDate.getSeconds();

    const atMinYear = fields.year === minYear;
    const atMinMonth = atMinYear && fields.month === minMonth;
    const atMinDay = atMinMonth && fields.day === minDay;
    const atMinHour = atMinDay && fields.hour === minHour;
    const atMinMinute = atMinHour && fields.minute === minMinute;

    yearMin = minYear;
    monthMin = atMinYear ? minMonth : 1;
    dayMin = atMinMonth ? minDay : 1;
    hourMin = atMinDay ? minHour : 0;
    minuteMin = atMinHour ? minMinute : 0;
    secondMin = atMinMinute ? minSecond : 0;

    constrainMin = (date: Date): Date => {
      const y = Math.max(date.getFullYear(), minYear);
      const m =
        y === minYear
          ? Math.max(date.getMonth() + 1, minMonth)
          : date.getMonth() + 1;
      const d =
        y === minYear && m === minMonth
          ? Math.max(date.getDate(), minDay)
          : date.getDate();
      const h =
        y === minYear && m === minMonth && d === minDay
          ? Math.max(date.getHours(), minHour)
          : date.getHours();
      const min =
        y === minYear && m === minMonth && d === minDay && h === minHour
          ? Math.max(date.getMinutes(), minMinute)
          : date.getMinutes();
      const s =
        y === minYear &&
        m === minMonth &&
        d === minDay &&
        h === minHour &&
        min === minMinute
          ? Math.max(date.getSeconds(), minSecond)
          : date.getSeconds();
      return new Date(y, m - 1, d, h, min, s);
    };
  }

  return {
    yearMax,
    monthMax,
    dayMax,
    hourMax,
    minuteMax,
    secondMax,
    yearMin,
    monthMin,
    dayMin,
    hourMin,
    minuteMin,
    secondMin,
    constrainMax,
    constrainMin,
  };
}
```

- [ ] **Step 4: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useDatetimeConstraints.ts src/test/useDatetimeConstraints.test.ts
git commit -m "feat: add minDate support to useDatetimeConstraints with constrainMin cascade"
```

---

## Task 3: `useMinDate` hook

**Files:**
- Create: `src/hooks/useMinDate.ts`
- Create: `src/test/useMinDate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/useMinDate.test.ts`:

```ts
import { vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMinDate } from "../hooks/useMinDate";

describe("useMinDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns now + 60s on mount", () => {
    const now = new Date(2026, 4, 10, 8, 0, 0);
    vi.setSystemTime(now);
    const { result } = renderHook(() => useMinDate());
    expect(result.current.getTime()).toBe(now.getTime() + 60_000);
  });

  it("updates to new now + 60s after one 60s tick", () => {
    const now = new Date(2026, 4, 10, 8, 0, 0);
    vi.setSystemTime(now);
    const { result } = renderHook(() => useMinDate());
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.getTime()).toBe(now.getTime() + 120_000);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/test/useMinDate.test.ts
```

Expected: FAIL — "Cannot find module '../hooks/useMinDate'"

- [ ] **Step 3: Implement `useMinDate`**

Create `src/hooks/useMinDate.ts`:

```ts
import { useState, useEffect } from "react";

export function useMinDate(): Date {
  const [minDate, setMinDate] = useState(() => new Date(Date.now() + 60_000));

  useEffect(() => {
    const id = setInterval(() => {
      setMinDate(new Date(Date.now() + 60_000));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  return minDate;
}
```

- [ ] **Step 4: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useMinDate.ts src/test/useMinDate.test.ts
git commit -m "feat: add useMinDate hook with 60s tick"
```

---

## Task 4: `Toast` component

No automated test — the auto-dismiss timer is exercised manually.

**Files:**
- Create: `src/components/Toast.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/Toast.tsx`:

```tsx
import { useEffect } from "react";

interface Props {
  message: string;
  onDismiss: () => void;
}

export function Toast({ message, onDismiss }: Props) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-40 bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 shadow-xl flex items-center gap-4 max-w-sm w-full mx-4">
      <p className="flex-1 text-white text-sm">{message}</p>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-slate-400 text-xl min-w-[44px] min-h-[44px] flex items-center justify-center active:opacity-60 transition-opacity cursor-pointer"
      >
        ✕
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass (no new tests, just verify nothing regresses)

- [ ] **Step 3: Commit**

```bash
git add src/components/Toast.tsx
git commit -m "feat: add generic Toast component with auto-dismiss"
```

---

## Task 5: Past-datetime guard in `useTimers`

**Files:**
- Modify: `src/hooks/useTimers.ts`

- [ ] **Step 1: Add the guard to `createTimer` and `editTimer`**

In `src/hooks/useTimers.ts`, update `createTimer` and `editTimer`:

```ts
export async function createTimer(
  data: Omit<Timer, "id" | "createdAt" | "updatedAt" | "originalTargetDatetime">,
): Promise<number | undefined> {
  if (data.targetDatetime <= new Date()) {
    throw new Error("TARGET_IN_PAST");
  }
  const now = new Date();
  return db.timers.add({
    ...data,
    originalTargetDatetime: data.targetDatetime,
    createdAt: now,
    updatedAt: now,
  });
}
```

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
  if (params.targetDatetime <= new Date()) {
    throw new Error("TARGET_IN_PAST");
  }
  const current = await db.timers.get(id);
  if (!current) return;

  const isAlreadyExtended = current.targetDatetime > current.originalTargetDatetime;
  const isExtending = params.targetDatetime > current.targetDatetime;

  if (isAlreadyExtended && isExtending) return;

  await db.timers.update(id, params);
}
```

- [ ] **Step 2: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useTimers.ts
git commit -m "feat: throw TARGET_IN_PAST guard in createTimer and editTimer"
```

---

## Task 6: Wire `DateTimeInput` and `CreateEditView`

**Files:**
- Modify: `src/components/DateTimeInput.tsx`
- Modify: `src/components/CreateEditView.tsx`

- [ ] **Step 1: Rewrite `DateTimeInput` to consume `minDate`**

Replace the entire contents of `src/components/DateTimeInput.tsx`:

```tsx
import { SpinnerField } from "./SpinnerField";
import { useDatetimeConstraints } from "../hooks/useDatetimeConstraints";
import type { DateFields } from "../hooks/useDatetimeConstraints";

interface Props {
  value: Date;
  onChange: (date: Date) => void;
  maxDate?: Date;
  minDate?: Date;
}

export function DateTimeInput({ value, onChange, maxDate, minDate }: Props) {
  const currentYear = new Date().getFullYear();

  const fields: DateFields = {
    year: value.getFullYear(),
    month: value.getMonth() + 1,
    day: value.getDate(),
    hour: value.getHours(),
    minute: value.getMinutes(),
    second: value.getSeconds(),
  };

  const {
    yearMax,
    monthMax,
    dayMax,
    hourMax,
    minuteMax,
    secondMax,
    yearMin,
    monthMin,
    dayMin,
    hourMin,
    minuteMin,
    secondMin,
    constrainMax,
    constrainMin,
  } = useDatetimeConstraints(fields, maxDate, minDate);

  const clamp = !!maxDate || !!minDate;

  const emit = (updated: DateFields) => {
    const naturalDayMax = new Date(updated.year, updated.month, 0).getDate();
    const safeDay = Math.min(updated.day, naturalDayMax);
    const raw = new Date(
      updated.year,
      updated.month - 1,
      safeDay,
      updated.hour,
      updated.minute,
      updated.second,
    );
    onChange(constrainMin(constrainMax(raw)));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <SpinnerField
          value={Math.min(fields.day, dayMax)}
          onChange={(v) => emit({ ...fields, day: v })}
          min={dayMin}
          max={dayMax}
          clamp={clamp}
          label="Day"
        />
        <SpinnerField
          value={fields.month}
          onChange={(v) => emit({ ...fields, month: v })}
          min={monthMin}
          max={monthMax}
          clamp={clamp}
          label="Month"
        />
        <SpinnerField
          value={fields.year}
          onChange={(v) => emit({ ...fields, year: v })}
          min={yearMin}
          max={yearMax}
          clamp
          label="Year"
        />
      </div>
      <div className="flex gap-2">
        <SpinnerField
          value={fields.hour}
          onChange={(v) => emit({ ...fields, hour: v })}
          min={hourMin}
          max={hourMax}
          clamp={clamp}
          label="Hour"
        />
        <SpinnerField
          value={fields.minute}
          onChange={(v) => emit({ ...fields, minute: v })}
          min={minuteMin}
          max={minuteMax}
          clamp={clamp}
          label="Min"
        />
        <SpinnerField
          value={fields.second}
          onChange={(v) => emit({ ...fields, second: v })}
          min={secondMin}
          max={secondMax}
          clamp={clamp}
          label="Sec"
          step={5}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `CreateEditView`**

Replace the entire contents of `src/components/CreateEditView.tsx`:

```tsx
import { useState, useEffect } from "react";
import { createTimer, editTimer } from "../hooks/useTimers";
import { DurationInput } from "./DurationInput";
import { DateTimeInput } from "./DateTimeInput";
import { EmojiButton } from "./EmojiButton";
import { Toast } from "./Toast";
import { useMinDate } from "../hooks/useMinDate";
import { durationToMs, msToDuration } from "../lib/duration";
import type { DurationValue } from "../lib/duration";
import { timeRemaining } from "../lib/countdown";
import { PRIORITIES, isPriority } from "../db/schema";
import type { Timer, Priority } from "../db/schema";

const TimerMode = {
  FromNow: "from-now",
  AtTime: "at-time",
} as const;

type TimerMode = (typeof TimerMode)[keyof typeof TimerMode];

interface Props {
  existing?: Timer;
  onDone: () => void;
}

export function CreateEditView({ existing, onDone }: Props) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [emoji, setEmoji] = useState(existing?.emoji ?? "");
  const [priority, setPriority] = useState<Priority>(
    existing?.priority ?? "medium",
  );
  const [mode, setMode] = useState<TimerMode>(TimerMode.FromNow);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const minDate = useMinDate();
  const isAlreadyExtended = existing
    ? existing.targetDatetime > existing.originalTargetDatetime
    : false;
  const [duration, setDuration] = useState<DurationValue>(() => {
    if (existing) return msToDuration(timeRemaining(existing.targetDatetime));
    return { days: 0, hours: 0, minutes: 5, seconds: 0 };
  });
  const [durationCap] = useState<DurationValue | undefined>(() =>
    isAlreadyExtended && existing
      ? msToDuration(timeRemaining(existing.targetDatetime))
      : undefined,
  );
  const [atTime, setAtTime] = useState<Date>(() => {
    const nextHourTarget = existing?.targetDatetime ?? new Date();
    nextHourTarget.setHours(nextHourTarget.getHours() + 1, 0, 0, 0);
    return nextHourTarget;
  });

  useEffect(() => {
    if (mode === TimerMode.AtTime && atTime < minDate) {
      setAtTime(new Date(minDate));
    }
  }, [minDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetDatetime =
      mode === TimerMode.FromNow
        ? new Date(
            Date.now() +
              durationToMs(
                duration.days,
                duration.hours,
                duration.minutes,
                duration.seconds,
              ),
          )
        : atTime;

    try {
      if (existing?.id !== undefined) {
        await editTimer(existing.id, { targetDatetime, title, emoji, priority });
      } else {
        await createTimer({
          title,
          emoji: emoji || null,
          description: null,
          targetDatetime,
          status: "active",
          priority,
          isFlagged: false,
          groupId: null,
          recurrenceRule: null,
        });
      }
      onDone();
    } catch (err) {
      if (err instanceof Error && err.message === "TARGET_IN_PAST") {
        setToastMessage("Target time cannot be in the past");
      } else {
        throw err;
      }
    }
  };

  function renderModeInput() {
    switch (mode) {
      case TimerMode.FromNow:
        return (
          <DurationInput
            value={duration}
            onChange={setDuration}
            maxValue={durationCap}
          />
        );
      case TimerMode.AtTime:
        return (
          <DateTimeInput
            value={atTime}
            onChange={setAtTime}
            maxDate={isAlreadyExtended ? existing!.targetDatetime : undefined}
            minDate={minDate}
          />
        );
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5 px-4 pt-4 box-border pb-tab-bar"
    >
      {toastMessage && (
        <Toast
          message={toastMessage}
          onDismiss={() => setToastMessage(null)}
        />
      )}
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
            mode === TimerMode.FromNow
              ? "bg-blue-600 text-white"
              : "bg-slate-700 text-slate-400"
          }`}
        >
          From now
        </button>
        <button
          type="button"
          onClick={() => setMode(TimerMode.AtTime)}
          className={`flex-1 py-3 text-base font-medium transition-colors ${
            mode === TimerMode.AtTime
              ? "bg-blue-600 text-white"
              : "bg-slate-700 text-slate-400"
          }`}
        >
          At time
        </button>
      </div>

      {renderModeInput()}

      <div className="flex flex-col gap-1">
        <label htmlFor="timer-priority" className="text-sm text-slate-400">
          Priority
        </label>
        <select
          id="timer-priority"
          className="rounded-lg p-3 bg-slate-700 text-white text-base min-h-[52px]"
          value={priority}
          onChange={(e) => {
            if (isPriority(e.target.value)) setPriority(e.target.value);
          }}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        className="rounded-lg p-4 bg-blue-600 text-white text-base font-semibold min-h-[52px] hover:bg-blue-500 active:scale-95 transition-all"
      >
        {existing ? "Update Timer" : "Create Timer"}
      </button>

      <button
        type="button"
        onClick={onDone}
        className="rounded-lg p-3 text-slate-400 text-base font-medium active:opacity-60 transition-opacity cursor-pointer"
      >
        Cancel
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add src/components/DateTimeInput.tsx src/components/CreateEditView.tsx
git commit -m "feat: wire minDate constraints and auto-jump into DateTimeInput and CreateEditView"
```
