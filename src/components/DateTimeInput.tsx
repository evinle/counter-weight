import { SpinnerField } from "./SpinnerField";
import { useDatetimeConstraints } from "../hooks/useDatetimeConstraints";
import type { DateFields } from "../hooks/useDatetimeConstraints";

interface Props {
  value: Date;
  onChange: (date: Date) => void;
  maxDate?: Date;
}

export function DateTimeInput({ value, onChange, maxDate }: Props) {
  const currentYear = new Date().getFullYear();

  const fields: DateFields = {
    year: value.getFullYear(),
    month: value.getMonth() + 1,
    day: value.getDate(),
    hour: value.getHours(),
    minute: value.getMinutes(),
    second: value.getSeconds(),
  };

  const {
    yearMax,
    monthMax,
    dayMax,
    hourMax,
    minuteMax,
    secondMax,
    constrain,
  } = useDatetimeConstraints(fields, maxDate);

  const emit = (updated: DateFields) => {
    const naturalDayMax = new Date(updated.year, updated.month, 0).getDate();
    const safeDay = Math.min(updated.day, naturalDayMax);
    const raw = new Date(
      updated.year,
      updated.month - 1,
      safeDay,
      updated.hour,
      updated.minute,
      updated.second,
    );
    onChange(constrain(raw));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <SpinnerField
          value={Math.min(fields.day, dayMax)}
          onChange={(v) => emit({ ...fields, day: v })}
          min={1}
          max={dayMax}
          label="Day"
        />
        <SpinnerField
          value={fields.month}
          onChange={(v) => emit({ ...fields, month: v })}
          min={1}
          max={monthMax}
          label="Month"
        />
        <SpinnerField
          value={fields.year}
          onChange={(v) => emit({ ...fields, year: v })}
          min={currentYear}
          max={yearMax}
          label="Year"
        />
      </div>
      <div className="flex gap-2">
        <SpinnerField
          value={fields.hour}
          onChange={(v) => emit({ ...fields, hour: v })}
          min={0}
          max={hourMax}
          label="Hour"
        />
        <SpinnerField
          value={fields.minute}
          onChange={(v) => emit({ ...fields, minute: v })}
          min={0}
          max={minuteMax}
          label="Min"
        />
        <SpinnerField
          value={fields.second}
          onChange={(v) => emit({ ...fields, second: v })}
          min={0}
          max={secondMax}
          label="Sec"
          step={5}
        />
      </div>
    </div>
  );
}
