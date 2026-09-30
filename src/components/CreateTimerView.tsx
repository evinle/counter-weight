import { createTimer } from "../hooks/useTimers";
import { useCommonFields, useTimeInputs } from "../hooks/useTimerForm";
import { TimerFormFrame } from "./TimerFormFrame";
import { TimerTimeEditor } from "./TimerTimeEditor";
import {
  TimerMode,
  leadTimeMaxDays,
  projectedTargetMs,
  resolveTargetDatetime,
} from "../lib/timerForm";
import { TimerType } from "../db/schema";

interface Props {
  onDone: () => void;
  userId: string | null;
  getNow?: () => number;
}

export function CreateTimerView({ onDone, userId, getNow = Date.now }: Props) {
  const fields = useCommonFields({
    title: "",
    emoji: "",
    priority: "medium",
    tagIds: [],
    timerType: TimerType.Reminder,
    leadTimeMs: null,
  });
  const time = useTimeInputs({
    mode: TimerMode.AtTime,
    duration: { days: 0, hours: 0, minutes: 5 },
    atTime: (() => {
      const d = new Date(getNow());
      d.setHours(d.getHours() + 1, 0, 0, 0);
      return d;
    })(),
    recurrenceRule: null,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createTimer(
      {
        title: fields.title,
        emoji: fields.emoji || null,
        description: null,
        targetDatetime: resolveTargetDatetime(time.inputs, getNow()),
        status: "active",
        priority: fields.priority,
        recurrenceRule: time.inputs.recurrenceRule,
        tagIds: fields.tagIds,
        timerType: fields.timerType,
        leadTimeMs: fields.leadTimeMs,
        workSessions: [],
      },
      userId,
    );
    onDone();
  };

  const targetMs = projectedTargetMs(time.inputs, getNow());

  return (
    <TimerFormFrame
      fields={fields}
      userId={userId}
      timeSection={
        <TimerTimeEditor
          time={time}
          allowRecurring={userId !== null}
          getNow={getNow}
        />
      }
      targetMs={targetMs}
      leadMaxDays={leadTimeMaxDays(time.inputs, targetMs, getNow())}
      getNow={getNow}
      submitLabel="Create Timer"
      submitDisabled={
        time.inputs.mode === TimerMode.AtTime &&
        time.inputs.atTime.getTime() < getNow()
      }
      onSubmit={handleSubmit}
      onCancel={onDone}
    />
  );
}
