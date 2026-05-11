import { SpinnerField } from './SpinnerField'

interface Props {
  value: Date
  onChange: (date: Date) => void
}

export function DateTimeInput({ value, onChange }: Props) {
  const currentYear = new Date().getFullYear()

  const month = value.getMonth() + 1
  const day = value.getDate()
  const year = value.getFullYear()
  const hour = value.getHours()
  const minute = value.getMinutes()
  const second = value.getSeconds()

  const daysInMonth = new Date(year, month, 0).getDate()

  const emit = (m: number, d: number, y: number, h: number, min: number, s: number) => {
    const maxDay = new Date(y, m, 0).getDate()
    onChange(new Date(y, m - 1, Math.min(d, maxDay), h, min, s))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <SpinnerField value={Math.min(day, daysInMonth)} onChange={(v) => emit(month, v, year, hour, minute, second)} min={1} max={daysInMonth}                   label="Day"   />
        <SpinnerField value={month}                    onChange={(v) => emit(v, day, year, hour, minute, second)}  min={1} max={12}                          label="Month" />
        <SpinnerField value={year}                     onChange={(v) => emit(month, day, v, hour, minute, second)} min={currentYear} max={currentYear + 10} clamp label="Year"  />
      </div>
      <div className="flex gap-2">
        <SpinnerField value={hour}   onChange={(v) => emit(month, day, year, v, minute, second)}  min={0} max={23} label="Hour" />
        <SpinnerField value={minute} onChange={(v) => emit(month, day, year, hour, v, second)}    min={0} max={59} label="Min"  />
        <SpinnerField value={second} onChange={(v) => emit(month, day, year, hour, minute, v)}    min={0} max={59} label="Sec" step={5}  />
      </div>
    </div>
  )
}
