# ADR 0002 — Next recurrence occurrence is spawned on user dismissal, not on fire

**Status:** Accepted

## Context

When a recurring timer fires (Notify Lambda sends push notification), two approaches were considered for spawning the next occurrence:

- **Auto-spawn on fire** — Notify Lambda immediately inserts the next occurrence and re-arms the EventBridge schedule, before the user interacts.
- **Spawn on dismissal** — the server's `complete` procedure spawns the next occurrence when the user explicitly taps Done. No next occurrence exists until then.

## Decision

Spawn on dismissal (user-gated).

## Reasons

- Auto-spawn is vulnerable to Lambda at-least-once delivery: a duplicate invocation would create two next-occurrence timers with no clean way to deduplicate.
- Auto-spawn removes user agency. A user who wants to pause the series (e.g. on vacation) has no mechanism to do so — timers keep spawning regardless of engagement.
- Spawn on dismissal naturally handles missed occurrences: the next occurrence is always computed from `Date.now()` at dismissal time, skipping any cycles that passed while the timer sat undismissed.

## Trade-offs

If the user permanently ignores a fired recurring timer, the series silently stops — no next occurrence is ever scheduled. This is considered acceptable: ignoring a fired timer is an implicit signal to stop. The user can always create a new recurring timer to restart the series.
