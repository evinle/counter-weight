import { SpinnerField } from "./SpinnerField";
import type { DurationValue } from "../lib/duration";

const DEFAULT_MAX: DurationValue = {
  days: 999,
  hours: 23,
  minutes: 59,
  seconds: 59,
};

interface Props {
  value: DurationValue;
  onChange: (v: DurationValue) => void;
  maxValue?: DurationValue;
}

export function DurationInput({ value, onChange, maxValue }: Props) {
  const max = maxValue ?? DEFAULT_MAX;
  return (
    <div className="flex gap-2">
      <SpinnerField
        value={value.days}
        onChange={(days) => onChange({ ...value, days })}
        min={0}
        max={max.days}
        clamp
        label="Days"
      />
      <SpinnerField
        value={value.hours}
        onChange={(hours) => onChange({ ...value, hours })}
        min={0}
        max={max.hours}
        label="Hours"
      />
      <SpinnerField
        value={value.minutes}
        onChange={(minutes) => onChange({ ...value, minutes })}
        min={0}
        max={max.minutes}
        label="Mins"
      />
      <SpinnerField
        value={value.seconds}
        onChange={(seconds) => onChange({ ...value, seconds })}
        min={0}
        max={max.seconds}
        label="Secs"
        step={5}
      />
    </div>
  );
}
