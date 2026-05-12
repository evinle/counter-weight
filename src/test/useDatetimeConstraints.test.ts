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
