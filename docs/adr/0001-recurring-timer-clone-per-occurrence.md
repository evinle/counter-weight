# ADR 0001 — Recurring timers clone a new row per occurrence

**Status:** Accepted

## Context

When a recurring timer fires, the system needs to advance to the next occurrence. Two approaches were considered:

- **Update in place** — bump `targetDatetime` on the existing timer row each cycle. One row lives forever.
- **Clone per occurrence** — the `complete` procedure inserts a new timer row for the next occurrence and marks the old one `completed`.

## Decision

Clone per occurrence.

## Reasons

- Each occurrence appears independently in history, which matches user expectations for a recurring reminder ("show me that I completed this every day last week").
- Update-in-place would make `originalTargetDatetime` ambiguous — it would point to the series start rather than the current occurrence's original time.
- The sync engine reconciles by `serverId + updatedAt`. A single row bumped every cycle would cause every device to re-sync the same timer on every occurrence, even devices that already acted on it.
- Cloning reuses the existing timer creation path (`upsert` + scheduler), keeping the blast radius of the recurrence feature small.

## Trade-offs

Each occurrence is a separate DB row and EventBridge schedule, which adds storage and scheduling overhead proportional to recurrence frequency. Acceptable at the expected scale (personal timer app, low-frequency recurrence).
