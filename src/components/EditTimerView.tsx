import { useState } from "react";
import { editTimer } from "../hooks/useTimers";
import { useToastStore } from "../hooks/useToast";
import { useCommonFields, useTimeInputs } from "../hooks/useTimerForm";
import { TimerFormFrame } from "./TimerFormFrame";
import { TimerTimeEditor } from "./TimerTimeEditor";
import {
  TimerMode,
  leadTimeMaxDays,
  projectedTargetMs,
  resolveTargetDatetime,
} from "../lib/timerForm";
import { msToDuration } from "../lib/duration";
import { timeRemaining } from "../lib/countdown";
import type { Timer } from "../db/schema";

interface Props {
  existing: Timer;
  onDone: () => void;
  userId: string | null;
  getNow?: () => number;
}

export function EditTimerView({
  existing,
  onDone,
  userId,
  getNow = Date.now,
}: Props) {
  const fields = useCommonFields({
    title: existing.title,
    emoji: existing.emoji ?? "",
    priority: existing.priority,
    tagIds: existing.tagIds,
    timerType: existing.timerType,
    leadTimeMs: existing.leadTimeMs,
  });
  const time = useTimeInputs({
    mode: existing.recurrenceRule ? TimerMode.Recurrence : TimerMode.AtTime,
    duration: msToDuration(timeRemaining(existing.targetDatetime)),
    atTime: new Date(existing.targetDatetime),
    recurrenceRule: existing.recurrenceRule,
  });
  const [timeEditUnlocked, setTimeEditUnlocked] = useState(false);

  function cancelTimeEdit() {
    time.setDuration(msToDuration(timeRemaining(existing.targetDatetime)));
    time.setAtTime(new Date(existing.targetDatetime));
    setTimeEditUnlocked(false);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (existing.id === undefined) return;

    const result = await editTimer(existing.id, {
      targetDatetime: timeEditUnlocked
        ? resolveTargetDatetime(time.inputs, getNow())
        : undefined,
      title: fields.title,
      emoji: fields.emoji,
      priority: fields.priority,
      tagIds: fields.tagIds,
      timerType: fields.timerType,
      leadTimeMs: fields.leadTimeMs,
      recurrenceRule:
        time.inputs.mode === TimerMode.Recurrence
          ? time.inputs.recurrenceRule
          : null,
    });
    if (result === false) {
      useToastStore.getState().show({
        message: "Timer can only be extended once",
        variant: "error",
      });
      return;
    }
    onDone();
  };

  const isAlreadyExtended =
    existing.targetDatetime > existing.originalTargetDatetime;

  const targetMs = timeEditUnlocked
    ? projectedTargetMs(time.inputs, getNow())
    : existing.targetDatetime.getTime();

  const timeSection = timeEditUnlocked ? (
    <>
      <TimerTimeEditor
        time={time}
        allowRecurring={userId !== null}
        getNow={getNow}
        atTimeMaxDate={isAlreadyExtended ? existing.targetDatetime : undefined}
      />
      <button
        type="button"
        onClick={cancelTimeEdit}
        className="text-sm text-ink-faint text-center w-full active:opacity-60 transition-opacity"
      >
        Cancel time edit
      </button>
    </>
  ) : (
    <div className="flex items-center justify-between">
      <span className="text-ink-muted text-base">
        {existing.targetDatetime.toLocaleString()}
      </span>
      <button
        type="button"
        onClick={() => setTimeEditUnlocked(true)}
        className="text-sm text-accent font-medium active:opacity-60 transition-opacity"
      >
        Edit time
      </button>
    </div>
  );

  return (
    <TimerFormFrame
      fields={fields}
      userId={userId}
      initialTagServerIds={existing.tagIds}
      timeSection={timeSection}
      targetMs={targetMs}
      leadMaxDays={leadTimeMaxDays(time.inputs, targetMs, getNow())}
      getNow={getNow}
      submitLabel="Update Timer"
      submitDisabled={
        time.inputs.mode === TimerMode.AtTime &&
        time.inputs.atTime.getTime() < getNow()
      }
      onSubmit={handleSubmit}
      onCancel={onDone}
    />
  );
}
