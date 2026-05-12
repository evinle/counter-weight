# DateTimeInput Max-Date Constraints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-field max-date capping to `DateTimeInput` so that when editing an already-extended timer, no field can be set to a value that would produce a date past the original deadline.

**Architecture:** A `useDatetimeConstraints(fields, maxDate)` hook computes per-field max values and a `constrain(date)` cascade function. `DateTimeInput` is refactored to use a `DateFields` named object instead of positional arguments, imports the hook, and passes each field's constrained max to its `SpinnerField`. When a higher-order field (e.g. hour) reaches the max boundary, calling `constrain()` in `emit` snaps lower fields (e.g. minute) down immediately.

**Tech Stack:** React, TypeScript, Vitest

---

## Files

- **Create:** `src/hooks/useDatetimeConstraints.ts` — `DateFields` interface, constraint hook, `constrain` cascade function
- **Create:** `src/test/useDatetimeConstraints.test.ts` — unit tests for the hook
- **Modify:** `src/components/DateTimeInput.tsx` — use `DateFields`, import hook, pass constrained maxes, wire `maxDate` prop
- **Modify:** `src/components/CreateEditView.tsx` — pass `maxDate` to `DateTimeInput` when timer is already extended

---

## Task 1: `useDatetimeConstraints` hook

**Files:**

- Create: `src/hooks/useDatetimeConstraints.ts`
- Create: `src/test/useDatetimeConstraints.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/test/useDatetimeConstraints.test.ts`:

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

  it("constrain returns the same date unchanged", () => {
    const { constrain } = useDatetimeConstraints(atMax, undefined);
    const d = new Date(2026, 4, 15, 8, 30, 15);
    expect(constrain(d).getTime()).toBe(d.getTime());
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

describe("constrain — cascade snapping", () => {
  it("snaps minute when hour is raised to max boundary", () => {
    // fields currently at hour=7 (below max), minute=45
    const fields: DateFields = { ...atMax, hour: 7, minute: 45 };
    const { constrain } = useDatetimeConstraints(fields, maxDate);
    // new date has hour=8 (at max), minute=45 (exceeds max of 30)
    const result = constrain(new Date(2026, 4, 15, 8, 45, 0));
    expect(result.getHours()).toBe(8);
    expect(result.getMinutes()).toBe(30);
  });

  it("does not snap minute when hour stays below max", () => {
    const fields: DateFields = { ...atMax, hour: 7, minute: 45 };
    const { constrain } = useDatetimeConstraints(fields, maxDate);
    const result = constrain(new Date(2026, 4, 15, 7, 45, 0));
    expect(result.getMinutes()).toBe(45);
  });

  it("snaps hour and minute when day is raised to max", () => {
    const fields: DateFields = { ...atMax, day: 14, hour: 23, minute: 59 };
    const { constrain } = useDatetimeConstraints(fields, maxDate);
    const result = constrain(new Date(2026, 4, 15, 23, 59, 0));
    expect(result.getHours()).toBe(8);
    expect(result.getMinutes()).toBe(30);
  });

  it("does not modify a date already within bounds", () => {
    const { constrain } = useDatetimeConstraints(atMax, maxDate);
    const d = new Date(2026, 4, 15, 8, 30, 15);
    expect(constrain(d).getTime()).toBe(d.getTime());
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/test/useDatetimeConstraints.test.ts
```

Expected: FAIL with "Cannot find module '../hooks/useDatetimeConstraints'"

- [ ] **Step 3: Implement `useDatetimeConstraints`**

Create `src/hooks/useDatetimeConstraints.ts`:

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
  constrain: (date: Date) => Date;
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
      constrain: (d) => d,
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

  function constrain(date: Date): Date {
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
    constrain,
  };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/test/useDatetimeConstraints.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useDatetimeConstraints.ts src/test/useDatetimeConstraints.test.ts
git commit -m "feat: add useDatetimeConstraints hook with cascade snapping"
```

---

## Task 2: Refactor `DateTimeInput` + wire `maxDate` in `CreateEditView`

**Files:**

- Modify: `src/components/DateTimeInput.tsx`
- Modify: `src/components/CreateEditView.tsx`

No new tests — the constraint logic is fully covered by Task 1. Run the existing suite after the change to confirm nothing regresses.

- [ ] **Step 1: Rewrite `DateTimeInput`**

Replace the entire contents of `src/components/DateTimeInput.tsx`:

```tsx
import { SpinnerField } from "./SpinnerField";
import { useDatetimeConstraints } from "../hooks/useDatetimeConstraints";
import type { DateFields } from "../hooks/useDatetimeConstraints";

interface Props {
  value: Date;
  onChange: (date: Date) => void;
  maxDate?: Date;
}

export function DateTimeInput({ value, onChange, maxDate }: Props) {
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
    constrain,
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
    onChange(constrain(raw));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <SpinnerField
          value={Math.min(fields.day, dayMax)}
          onChange={(v) => emit({ ...fields, day: v })}
          min={1}
          max={dayMax}
          clamp={!!maxDate}
          label="Day"
        />
        <SpinnerField
          value={fields.month}
          onChange={(v) => emit({ ...fields, month: v })}
          min={1}
          max={monthMax}
          clamp={!!maxDate}
          label="Month"
        />
        <SpinnerField
          value={fields.year}
          onChange={(v) => emit({ ...fields, year: v })}
          min={currentYear}
          max={yearMax}
          clamp
          label="Year"
        />
      </div>
      <div className="flex gap-2">
        <SpinnerField
          value={fields.hour}
          onChange={(v) => emit({ ...fields, hour: v })}
          min={0}
          max={hourMax}
          clamp={!!maxDate}
          label="Hour"
        />
        <SpinnerField
          value={fields.minute}
          onChange={(v) => emit({ ...fields, minute: v })}
          min={0}
          max={minuteMax}
          clamp={!!maxDate}
          label="Min"
        />
        <SpinnerField
          value={fields.second}
          onChange={(v) => emit({ ...fields, second: v })}
          min={0}
          max={secondMax}
          clamp={!!maxDate}
          label="Sec"
          step={5}
        />
      </div>
    </div>
  );
}
```

Note on `emit`: `safeDay` clamps the day to the natural month limit before constructing the raw `Date`, preventing JavaScript from rolling over into the next month (e.g. Feb 31 → Mar 2). `constrain` then handles the maxDate boundary on top of that.

Note on `clamp`: fields use `clamp={!!maxDate}` — wrapping behaviour is preserved when no cap is active, and clamping kicks in for all fields when a cap is present.

- [ ] **Step 2: Update `CreateEditView` to pass `maxDate` to `DateTimeInput`**

In `src/components/CreateEditView.tsx`, find the `TimerMode.AtTime` case (line ~93) and replace:

```tsx
return <DateTimeInput value={atTime} onChange={setAtTime} />;
```

with:

```tsx
return (
  <DateTimeInput
    value={atTime}
    onChange={setAtTime}
    maxDate={isAlreadyExtended ? existing!.targetDatetime : undefined}
  />
);
```

`isAlreadyExtended` is already derived earlier in the component from Task 7.

- [ ] **Step 3: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add src/components/DateTimeInput.tsx src/components/CreateEditView.tsx
git commit -m "feat: add per-field max-date constraints to DateTimeInput"
```

---
