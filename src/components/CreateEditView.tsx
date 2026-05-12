import { useState } from "react";
import { createTimer, editTimer } from "../hooks/useTimers";
import { DurationInput } from "./DurationInput";
import { DateTimeInput } from "./DateTimeInput";
import { EmojiButton } from "./EmojiButton";
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
  const isAlreadyExtended = existing
    ? existing.targetDatetime > existing.originalTargetDatetime
    : false
  const [duration, setDuration] = useState<DurationValue>(() => {
    if (existing) return msToDuration(timeRemaining(existing.targetDatetime));
    return { days: 0, hours: 0, minutes: 5, seconds: 0 };
  });
  const [atTime, setAtTime] = useState<Date>(() => {
    const nextHourTarget = existing?.targetDatetime ?? new Date();
    nextHourTarget.setHours(nextHourTarget.getHours() + 1, 0, 0, 0);
    return nextHourTarget;
  });

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
  };

  function renderModeInput() {
    switch (mode) {
      case TimerMode.FromNow:
        return <DurationInput value={duration} onChange={setDuration} maxValue={isAlreadyExtended ? duration : undefined} />;
      case TimerMode.AtTime:
        return <DateTimeInput value={atTime} onChange={setAtTime} />;
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5 px-4 pt-4 box-border pb-tab-bar"
    >
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
