# ADR 0007 — Clock dial for interval (hours + minutes) input

The `EveryNHoursMinutes` recurrence preset and the `DurationPicker` both require the user to set an hours + minutes value that represents a duration, not a wall-clock time. We use the same `ClockDial` component for these, rather than spinners or a purpose-built interval control.

The dial operates in an `interval` mode: the 12-hour face is retained (familiar geometry, no new SVG work), the AM/PM toggle is relabelled `0–11` / `12–23`, and the center display shows the computed 0–23 value directly rather than the face value. This avoids the time-of-day connotation of "AM/PM" while reusing the pointer-capture drag mechanics and two-phase hour→minute flow that are already built and tested.

## Considered Options

- **Spinners** — retired project-wide because they are hard to read and have poor touch ergonomics on mobile.
- **Purpose-built 24-hour dial** — 24 numbers around the face is cramped; would require new geometry and new tests for a single preset.
- **Quick-tap buttons (+1h, +2h, …)** — does not allow arbitrary values (e.g. "every 3h 40m").
