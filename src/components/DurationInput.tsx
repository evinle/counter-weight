import { SpinnerField } from './SpinnerField'
import type { DurationValue } from '../lib/duration'

interface Props {
  value: DurationValue
  onChange: (v: DurationValue) => void
}

export function DurationInput({ value, onChange }: Props) {
  return (
    <div className="flex gap-2">
      <SpinnerField
        value={value.days}
        onChange={(days) => onChange({ ...value, days })}
        min={0} max={999} clamp
        label="Days"
      />
      <SpinnerField
        value={value.hours}
        onChange={(hours) => onChange({ ...value, hours })}
        min={0} max={23}
        label="Hours"
      />
      <SpinnerField
        value={value.minutes}
        onChange={(minutes) => onChange({ ...value, minutes })}
        min={0} max={59}
        label="Mins"
      />
      <SpinnerField
        value={value.seconds}
        onChange={(seconds) => onChange({ ...value, seconds })}
        min={0} max={59}
        label="Secs"
      />
    </div>
  )
}
