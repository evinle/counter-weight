import type { DurationValue } from '../lib/duration'

interface Props {
  value: DurationValue
  onChange: (v: DurationValue) => void
}

const FIELDS: { key: keyof DurationValue; label: string; max?: number }[] = [
  { key: 'days', label: 'Days' },
  { key: 'hours', label: 'Hours', max: 23 },
  { key: 'minutes', label: 'Minutes', max: 59 },
]

export function DurationInput({ value, onChange }: Props) {
  return (
    <div className="flex gap-3">
      {FIELDS.map(({ key, label, max }) => (
        <div key={key} className="flex-1 flex flex-col gap-1">
          <label className="text-sm text-slate-400">{label}</label>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={max}
            value={value[key]}
            onChange={(e) => {
              const raw = parseInt(e.target.value, 10)
              const clamped = isNaN(raw)
                ? 0
                : max !== undefined
                  ? Math.min(max, Math.max(0, raw))
                  : Math.max(0, raw)
              onChange({ ...value, [key]: clamped })
            }}
            className="rounded-lg p-3 bg-slate-700 text-white text-center text-lg min-h-[52px]"
          />
        </div>
      ))}
    </div>
  )
}
