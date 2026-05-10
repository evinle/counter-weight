---
title: Overdue Countdown — Negative Timer Display
date: 2026-05-10
status: approved
---

# Overdue Countdown Design

## Goal

Timers that have fired but haven't been marked Done should count upward in the negative, showing how long they've been overdue. The countdown number turns red to draw attention without disrupting the rest of the card.

## Behaviour

- `timeRemaining(date)` returns raw negative ms for past targets (clamp removed).
- The countdown number displays a `-` prefix once overdue: `"-00:01:15"`, `"-1d 01:01:01"`.
- The card is **not** dimmed when overdue — the red number is the attention signal.
- The Edit button stays disabled while overdue (cannot reschedule an already-fired timer).

## `isOverdue` flag

A single derived flag drives all overdue state in `TimerCard`:

```ts
const isOverdue = remaining <= 0
```

| Condition | Effect |
|---|---|
| `isOverdue` | countdown text → `text-red-400` |
| `isOverdue` | Edit button → `disabled` |
| `isOverdue` | card `opacity-60` → removed |

## Component changes

### `src/lib/countdown.ts`

`timeRemaining`: remove `Math.max(0, ...)`.

`formatDuration`: add negative path — if `ms < 0`, return `'-' + formatDuration(-ms)`.

### `src/hooks/useAnimatedCountdown.ts`

No changes — it already calls `timeRemaining` every rAF frame.

### `src/components/TimerCard.tsx`

Replace `const isExpired = remaining === 0` with `const isOverdue = remaining <= 0`.

Apply `text-red-400` to the countdown `<span>` when `isOverdue`.

Remove `opacity-60` from the card container (was conditional on `isExpired`).

### `src/test/countdown.test.ts`

- Update `timeRemaining` "past target" test: assert result is **negative**, not 0.
- Add `formatDuration` negative cases: `formatDuration(-75_000)` → `"-00:01:15"`, `formatDuration(-90_061_000)` → `"-1d 01:01:01"`.

## Out of scope

- Pulsing / animating the Done button when overdue.
- Any store or Dexie schema changes — `status: 'fired'` already represents the fired state.
