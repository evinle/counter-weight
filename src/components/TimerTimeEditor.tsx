import { DurationPicker } from "./DurationPicker";
import { DateTimeInput } from "./DateTimeInput";
import { RecurrencePicker } from "./RecurrencePicker";
import { TimerModeToggle } from "./TimerModeToggle";
import { TimerMode } from "../lib/timerForm";
import type { TimeInputState } from "../hooks/useTimerForm";

interface Props {
  time: TimeInputState;
  allowRecurring: boolean;
  getNow: () => number;
  atTimeMaxDate?: Date;
}

/** Mode toggle plus the input for the selected mode. */
export function TimerTimeEditor({
  time,
  allowRecurring,
  getNow,
  atTimeMaxDate,
}: Props) {
  const { mode, duration, atTime, recurrenceRule } = time.inputs;

  function renderModeInput() {
    switch (mode) {
      case TimerMode.FromNow:
        return <DurationPicker value={duration} onChange={time.setDuration} />;
      case TimerMode.AtTime:
        return (
          <>
            <DateTimeInput
              value={atTime}
              onChange={time.setAtTime}
              maxDate={atTimeMaxDate}
            />
            {atTime.getTime() < getNow() && (
              <p className="text-sm text-warning text-center">
                This time is in the past
              </p>
            )}
          </>
        );
      case TimerMode.Recurrence:
        return (
          <RecurrencePicker
            value={recurrenceRule}
            onChange={time.setRecurrenceRule}
          />
        );
    }
  }

  return (
    <>
      <TimerModeToggle
        mode={mode}
        onChange={time.setMode}
        allowRecurring={allowRecurring}
      />
      {renderModeInput()}
    </>
  );
}
