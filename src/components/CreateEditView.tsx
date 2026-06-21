import { useState } from "react";
import { createTimer, editTimer } from "../hooks/useTimers";
import { useToastStore } from "../hooks/useToast";
import { DurationInput } from "./DurationInput";
import { DateTimeInput } from "./DateTimeInput";
import { EmojiButton } from "./EmojiButton";
import { TagPicker } from "./TagPicker";
import { SpinnerField } from "./SpinnerField";
import { OptionalField } from "./OptionalField";
import { RecurrencePicker } from "./RecurrencePicker";
import { SelectField } from "./SelectField";
import { nextOccurrence } from "@cw/recurrence";
import { durationToMs, msToDuration } from "../lib/duration";
import type { DurationValue } from "../lib/duration";
import { timeRemaining, formatLeadNotificationPreview } from "../lib/countdown";
import { PRIORITIES, isPriority, TimerType } from "../db/schema";
import type { Timer, Priority, TimerType as TimerTypeT } from "../db/schema";

const TimerMode = {
  FromNow: "from-now",
  AtTime: "at-time",
  Recurrence: "recurrence",
} as const satisfies Record<string, string>;

type TimerMode = (typeof TimerMode)[keyof typeof TimerMode];

interface Props {
  existing?: Timer;
  onDone: () => void;
  userId: string | null;
}

function snapshotDurationFor(existing: Timer): DurationValue {
  return msToDuration(timeRemaining(existing.targetDatetime));
}

export function CreateEditView({ existing, onDone, userId }: Props) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [emoji, setEmoji] = useState(existing?.emoji ?? "");
  const [priority, setPriority] = useState<Priority>(
    existing?.priority ?? "medium",
  );
  const [tagIds, setTagIds] = useState<string[]>(existing?.tagIds ?? []);
  const [timerType, setTimerType] = useState<TimerTypeT>(
    existing?.timerType ?? TimerType.Reminder,
  );
  const [leadTimeMs, setLeadTimeMs] = useState<number | null>(
    existing?.leadTimeMs ?? null,
  );
  const [recurrenceRule, setRecurrenceRule] = useState<{
    cron: string;
    tz: string;
  } | null>(existing?.recurrenceRule ?? null);
  const leadDuration = msToDuration(leadTimeMs ?? 0);
  function setLeadTime(
    days: number,
    hours: number,
    mins: number,
    secs: number,
  ) {
    setLeadTimeMs(durationToMs(days, hours, mins, secs));
  }
  const [mode, setMode] = useState<TimerMode>(() => {
    if (existing?.recurrenceRule) return TimerMode.Recurrence;
    return TimerMode.AtTime;
  });
  const [timeEditUnlocked, setTimeEditUnlocked] = useState(false);
  const [duration, setDuration] = useState<DurationValue>(() =>
    existing
      ? snapshotDurationFor(existing)
      : { days: 0, hours: 0, minutes: 5, seconds: 0 },
  );
  const [atTime, setAtTime] = useState<Date>(() => {
    if (existing) return new Date(existing.targetDatetime);
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d;
  });

  function cancelTimeEdit() {
    if (existing) {
      setDuration(snapshotDurationFor(existing));
      setAtTime(new Date(existing.targetDatetime));
    }
    setTimeEditUnlocked(false);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (existing?.id !== undefined) {
      const targetDatetime = timeEditUnlocked
        ? mode === TimerMode.FromNow
          ? new Date(
              Date.now() +
                durationToMs(
                  duration.days,
                  duration.hours,
                  duration.minutes,
                  duration.seconds,
                ),
            )
          : mode === TimerMode.Recurrence && recurrenceRule
            ? nextOccurrence(recurrenceRule.cron, recurrenceRule.tz)
            : atTime
        : undefined;
      const result = await editTimer(existing.id, {
        targetDatetime,
        title,
        emoji,
        priority,
        tagIds,
        timerType,
        leadTimeMs,
        recurrenceRule: mode === TimerMode.Recurrence ? recurrenceRule : null,
      });
      if (result === false) {
        useToastStore.getState().show({
          message: "Timer can only be extended once",
          variant: "error",
        });
        return;
      }
    } else {
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
          : mode === TimerMode.Recurrence && recurrenceRule
            ? nextOccurrence(recurrenceRule.cron, recurrenceRule.tz)
            : atTime;
      await createTimer(
        {
          title,
          emoji: emoji || null,
          description: null,
          targetDatetime,
          status: "active",
          priority,
          recurrenceRule,
          tagIds,
          timerType,
          leadTimeMs,
          workSessions: [],
        },
        userId,
      );
    }
    onDone();
  };

  const isAlreadyExtended = existing
    ? existing.targetDatetime > existing.originalTargetDatetime
    : false;

  function maskLeadTime(newRemainingMs: number) {
    if (leadTimeMs === null) return;
    const r = msToDuration(Math.max(0, newRemainingMs));
    const newShowDays = r.days >= 1;
    const newShowHours = newShowDays || r.hours >= 1;
    const newShowMins = newShowHours || r.minutes >= 1;
    const d = msToDuration(leadTimeMs);
    const masked = durationToMs(
      newShowDays ? d.days : 0,
      newShowHours ? d.hours : 0,
      newShowMins ? d.minutes : 0,
      d.seconds,
    );
    if (masked !== leadTimeMs) setLeadTimeMs(masked);
  }

  function renderModeInput() {
    switch (mode) {
      case TimerMode.FromNow:
        return (
          <DurationInput
            value={duration}
            onChange={(d) => {
              setDuration(d);
              maskLeadTime(durationToMs(d.days, d.hours, d.minutes, d.seconds));
            }}
          />
        );
      case TimerMode.AtTime:
        return (
          <DateTimeInput
            value={atTime}
            onChange={setAtTime}
            maxDate={isAlreadyExtended ? existing!.targetDatetime : undefined}
          />
        );
      case TimerMode.Recurrence:
        return (
          <RecurrencePicker
            value={recurrenceRule}
            onChange={setRecurrenceRule}
          />
        );
    }
  }

  const showTimeEditor = !existing || timeEditUnlocked;

  const remainingMs = (() => {
    if (!showTimeEditor && existing)
      return timeRemaining(existing.targetDatetime);
    if (mode === TimerMode.AtTime)
      return atTime.getTime() - new Date().getTime();
    return durationToMs(
      duration.days,
      duration.hours,
      duration.minutes,
      duration.seconds,
    );
  })();
  const remainingDuration = msToDuration(Math.max(0, remainingMs));

  const targetMs: number | null = (() => {
    if (!showTimeEditor && existing) return existing.targetDatetime.getTime();
    if (mode === TimerMode.AtTime) return atTime.getTime();
    if (mode === TimerMode.Recurrence) {
      if (!recurrenceRule) return null;
      try {
        return nextOccurrence(recurrenceRule.cron, recurrenceRule.tz).getTime();
      } catch {
        return null;
      }
    }
    return Date.now() + durationToMs(duration.days, duration.hours, duration.minutes, duration.seconds);
  })();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const leadPreview =
    leadTimeMs !== null && targetMs !== null
      ? formatLeadNotificationPreview(targetMs, leadTimeMs, new Date(), tz)
      : null;
  const showLeadDays = remainingDuration.days >= 1;
  const showLeadHours = showLeadDays || remainingDuration.hours >= 1;
  const showLeadMinutes = showLeadHours || remainingDuration.minutes >= 1;

  return (
    <form onSubmit={handleSubmit} className="overflow-auto h-full box-border">
      <div className="flex flex-col gap-5 px-4 pt-4">
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

        {showTimeEditor ? (
          <>
            <div className="h-12 flex rounded-xl overflow-hidden border border-slate-600">
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
              {userId !== null && (
                <button
                  type="button"
                  onClick={() => setMode(TimerMode.Recurrence)}
                  className={`flex-1 py-3 text-base font-medium transition-colors ${
                    mode === TimerMode.Recurrence
                      ? "bg-blue-600 text-white"
                      : "bg-slate-700 text-slate-400"
                  }`}
                >
                  Recurring
                </button>
              )}
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
            </div>

            {renderModeInput()}

            {existing && (
              <button
                type="button"
                onClick={cancelTimeEdit}
                className="text-sm text-slate-500 text-center w-full active:opacity-60 transition-opacity"
              >
                Cancel time edit
              </button>
            )}
          </>
        ) : (
          existing && (
            <div className="flex items-center justify-between">
              <span className="text-slate-300 text-base">
                {existing.targetDatetime.toLocaleString()}
              </span>
              <button
                type="button"
                onClick={() => setTimeEditUnlocked(true)}
                className="text-sm text-blue-400 font-medium active:opacity-60 transition-opacity"
              >
                Edit time
              </button>
            </div>
          )
        )}

        <SelectField
          label="Priority"
          id="timer-priority"
          value={priority}
          onChange={(v) => {
            if (isPriority(v)) setPriority(v);
          }}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </SelectField>

        <div className="flex flex-col gap-1">
          <span className="text-sm text-slate-400">Tags</span>
          <TagPicker
            userId={userId}
            initialServerIds={existing?.tagIds}
            onChange={setTagIds}
          />
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            aria-label="Task"
            className="w-5 h-5 rounded accent-blue-500"
            checked={timerType === TimerType.Task}
            onChange={(e) =>
              setTimerType(
                e.target.checked ? TimerType.Task : TimerType.Reminder,
              )
            }
          />
          <span className="text-sm text-slate-400">Task</span>
        </label>

        <OptionalField
          label="Remind me before"
          activateLabel="Set time"
          clearLabel="Cancel reminder"
          active={leadTimeMs !== null}
          onActivate={() => setLeadTimeMs(0)}
          onClear={() => setLeadTimeMs(null)}
        >
          <div className="flex gap-2" data-testid="lead-time-fields">
            {showLeadDays && (
              <SpinnerField
                label="Days"
                value={leadDuration.days}
                onChange={(d) =>
                  setLeadTime(
                    d,
                    leadDuration.hours,
                    leadDuration.minutes,
                    leadDuration.seconds,
                  )
                }
                min={0}
                max={999}
                clamp
              />
            )}
            {showLeadHours && (
              <SpinnerField
                label="Hours"
                value={leadDuration.hours}
                onChange={(h) =>
                  setLeadTime(
                    leadDuration.days,
                    h,
                    leadDuration.minutes,
                    leadDuration.seconds,
                  )
                }
                min={0}
                max={23}
              />
            )}
            {showLeadMinutes && (
              <SpinnerField
                label="Minutes"
                value={leadDuration.minutes}
                onChange={(m) =>
                  setLeadTime(
                    leadDuration.days,
                    leadDuration.hours,
                    m,
                    leadDuration.seconds,
                  )
                }
                min={0}
                max={59}
              />
            )}
            <SpinnerField
              label="Seconds"
              value={leadDuration.seconds}
              onChange={(s) =>
                setLeadTime(
                  leadDuration.days,
                  leadDuration.hours,
                  leadDuration.minutes,
                  s,
                )
              }
              min={0}
              max={59}
            />
          </div>
          {leadPreview !== null && (
            <p className="text-sm text-slate-400" data-testid="lead-time-preview">
              {leadPreview === "Invalid" ? "Invalid" : `Notifies: ${leadPreview}`}
            </p>
          )}
        </OptionalField>

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
      </div>
    </form>
  );
}
