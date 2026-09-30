import { nextOccurrence, computePeriodMs } from "@cw/recurrence";
import { durationToMs, msToDuration } from "./duration";
import type { DurationValue } from "./duration";

export const TimerMode = {
  FromNow: "from-now",
  AtTime: "at-time",
  Recurrence: "recurrence",
} as const satisfies Record<string, string>;

export type TimerMode = (typeof TimerMode)[keyof typeof TimerMode];

export interface RecurrenceRule {
  cron: string;
  tz: string;
}

export interface TimeInputs {
  mode: TimerMode;
  duration: DurationValue;
  atTime: Date;
  recurrenceRule: RecurrenceRule | null;
}

export type LeadTimeVisibility = {
  showDays: boolean;
  showHours: boolean;
  showMinutes: boolean;
};

export function computeLeadTimeVisibility(
  mode: TimerMode,
  remainingMs: number,
  recurrenceRule: RecurrenceRule | null,
): LeadTimeVisibility {
  const boundMs =
    mode === TimerMode.Recurrence && recurrenceRule
      ? computePeriodMs(recurrenceRule.cron, recurrenceRule.tz)
      : remainingMs;

  const d = msToDuration(Math.max(0, boundMs));
  const showDays = d.days >= 1;
  const showHours = showDays || d.hours >= 1;
  const showMinutes = showHours || d.minutes >= 1;
  return { showDays, showHours, showMinutes };
}

/** The target datetime the current time inputs would produce if submitted. */
export function resolveTargetDatetime(inputs: TimeInputs, now: number): Date {
  const { mode, duration, atTime, recurrenceRule } = inputs;
  if (mode === TimerMode.FromNow) {
    return new Date(
      now + durationToMs(duration.days, duration.hours, duration.minutes),
    );
  }
  if (mode === TimerMode.Recurrence && recurrenceRule) {
    return nextOccurrence(recurrenceRule.cron, recurrenceRule.tz);
  }
  return atTime;
}

/** Like resolveTargetDatetime, but null when a recurrence rule can't produce one. */
export function projectedTargetMs(
  inputs: TimeInputs,
  now: number,
): number | null {
  const { mode, atTime, recurrenceRule } = inputs;
  if (mode === TimerMode.AtTime) return atTime.getTime();
  if (mode === TimerMode.Recurrence) {
    if (!recurrenceRule) return null;
    try {
      return nextOccurrence(recurrenceRule.cron, recurrenceRule.tz).getTime();
    } catch {
      return null;
    }
  }
  return resolveTargetDatetime(inputs, now).getTime();
}

/** Upper bound (in days) for the lead-time slider. */
export function leadTimeMaxDays(
  inputs: TimeInputs,
  targetMs: number | null,
  now: number,
): number {
  const { mode, recurrenceRule } = inputs;
  if (mode === TimerMode.Recurrence && recurrenceRule) {
    const periodMs = computePeriodMs(recurrenceRule.cron, recurrenceRule.tz);
    return Math.min(28, Math.max(0, Math.floor(periodMs / 86_400_000)));
  }
  if (targetMs !== null) {
    return Math.min(28, Math.max(0, Math.floor((targetMs - now) / 86_400_000)));
  }
  return 28;
}
