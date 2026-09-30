import { useState } from "react";
import { TimerType } from "../db/schema";
import type { Priority, TimerType as TimerTypeT } from "../db/schema";
import type { DurationValue } from "../lib/duration";
import type { RecurrenceRule, TimeInputs, TimerMode } from "../lib/timerForm";

export interface CommonFieldValues {
  title: string;
  emoji: string;
  priority: Priority;
  tagIds: string[];
  timerType: TimerTypeT;
  leadTimeMs: number | null;
}

export function useCommonFields(initial: CommonFieldValues) {
  const [title, setTitle] = useState(initial.title);
  const [emoji, setEmoji] = useState(initial.emoji);
  const [priority, setPriority] = useState<Priority>(initial.priority);
  const [tagIds, setTagIds] = useState<string[]>(initial.tagIds);
  const [timerType, setTimerType] = useState<TimerTypeT>(initial.timerType);
  const [leadTimeMs, setLeadTimeMs] = useState<number | null>(
    initial.leadTimeMs,
  );
  return {
    title,
    setTitle,
    emoji,
    setEmoji,
    priority,
    setPriority,
    tagIds,
    setTagIds,
    timerType,
    setTimerType,
    isTask: timerType === TimerType.Task,
    leadTimeMs,
    setLeadTimeMs,
  };
}

export type CommonFields = ReturnType<typeof useCommonFields>;

export function useTimeInputs(initial: TimeInputs) {
  const [mode, setMode] = useState<TimerMode>(initial.mode);
  const [duration, setDuration] = useState<DurationValue>(initial.duration);
  const [atTime, setAtTime] = useState<Date>(initial.atTime);
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule | null>(
    initial.recurrenceRule,
  );
  const inputs: TimeInputs = { mode, duration, atTime, recurrenceRule };
  return {
    inputs,
    setMode,
    setDuration,
    setAtTime,
    setRecurrenceRule,
  };
}

export type TimeInputState = ReturnType<typeof useTimeInputs>;
