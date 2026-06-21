import { useState, useEffect } from 'react'
import {
  buildDailyCron,
  buildWeeklyCron,
  buildMonthlyCron,
  buildLastDayOfMonthCron,
  buildCustomWeeklyCron,
  buildCustomEveryNDaysCron,
  buildCustomEveryHMCron,
  parseCron,
  nextOccurrence,
} from '@cw/recurrence'
import { SpinnerField } from './SpinnerField'
import { SelectField } from './SelectField'

type RecurrenceRule = { cron: string; tz: string }

const Preset = {
  Daily: 'daily',
  Weekly: 'weekly',
  Monthly: 'monthly',
  EveryNDays: 'every-n-days',
  EveryNHoursMinutes: 'every-n-hours-minutes',
} as const satisfies Record<string, string>
type Preset = typeof Preset[keyof typeof Preset]

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

function nextQuarterHour(now: Date): { hour: number; minute: number } {
  const totalMins = now.getUTCHours() * 60 + now.getUTCMinutes()
  const rounded = Math.ceil(totalMins / 15) * 15
  return { hour: Math.floor(rounded / 60) % 24, minute: rounded % 60 }
}

function toTimeString(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function parseHHMM(hhmm: string): { hour: number; minute: number } {
  const [h, m] = hhmm.split(':').map(Number)
  return { hour: h ?? 9, minute: m ?? 0 }
}

interface State {
  preset: Preset
  hour: number
  minute: number
  weeklyDays: number[]
  monthlyDom: number
  monthlyLastDay: boolean
  everyN: number
  everyH: number
  everyM: number
}

function initState(value: RecurrenceRule | null, now: Date): State {
  const { hour: defHour, minute: defMinute } = nextQuarterHour(now)
  const defDow = now.getUTCDay()
  const defDom = now.getUTCDate()

  const defaults: State = {
    preset: Preset.Daily,
    hour: defHour,
    minute: defMinute,
    weeklyDays: [defDow],
    monthlyDom: defDom,
    monthlyLastDay: false,
    everyN: 2,
    everyH: 2,
    everyM: 0,
  }

  if (!value) return defaults

  const parsed = parseCron(value.cron)
  if (!parsed) return defaults

  switch (parsed.preset) {
    case 'daily': {
      const { hour, minute } = parseHHMM(parsed.time)
      return { ...defaults, preset: Preset.Daily, hour, minute }
    }
    case 'weekday': {
      const { hour, minute } = parseHHMM(parsed.time)
      return { ...defaults, preset: Preset.Weekly, hour, minute, weeklyDays: [1, 2, 3, 4, 5] }
    }
    case 'weekly': {
      const { hour, minute } = parseHHMM(parsed.time)
      return { ...defaults, preset: Preset.Weekly, hour, minute, weeklyDays: [defDow] }
    }
    case 'monthly': {
      const { hour, minute } = parseHHMM(parsed.time)
      return { ...defaults, preset: Preset.Monthly, hour, minute, monthlyDom: defDom }
    }
    case 'custom-weekly': {
      const { hour, minute } = parseHHMM(parsed.time)
      return { ...defaults, preset: Preset.Weekly, hour, minute, weeklyDays: parsed.days }
    }
    case 'custom-monthly': {
      const { hour, minute } = parseHHMM(parsed.time)
      if (parsed.dom === 'L') {
        return { ...defaults, preset: Preset.Monthly, hour, minute, monthlyLastDay: true }
      }
      return { ...defaults, preset: Preset.Monthly, hour, minute, monthlyDom: parsed.dom }
    }
    case 'custom-every-n-days': {
      const { hour, minute } = parseHHMM(parsed.time)
      return { ...defaults, preset: Preset.EveryNDays, hour, minute, everyN: parsed.n }
    }
    case 'custom-every-hm':
      return { ...defaults, preset: Preset.EveryNHoursMinutes, everyH: parsed.hours, everyM: parsed.minutes }
  }

  return defaults
}

interface Props {
  value: RecurrenceRule | null
  onChange: (rule: RecurrenceRule | null) => void
  now?: Date
}

export function RecurrencePicker({ value, onChange, now = new Date() }: Props) {
  const init = initState(value, now)
  const [preset, setPreset] = useState<Preset>(init.preset)
  const [hour, setHour] = useState(init.hour)
  const [minute, setMinute] = useState(init.minute)
  const [weeklyDays, setWeeklyDays] = useState<number[]>(init.weeklyDays)
  const [monthlyDom, setMonthlyDom] = useState(init.monthlyDom)
  const [monthlyLastDay, setMonthlyLastDay] = useState(init.monthlyLastDay)
  const [everyN, setEveryN] = useState(init.everyN)
  const [everyH, setEveryH] = useState(init.everyH)
  const [everyM, setEveryM] = useState(init.everyM)

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

  // Sync parent on mount so recurrenceRule is never null when this component is visible
  useEffect(() => {
    const rule = buildRule({ preset, hour, minute, weeklyDays, monthlyDom, monthlyLastDay, everyN, everyH, everyM })
    if (rule !== null) onChange(rule)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function buildRule(s: {
    preset: Preset
    hour: number
    minute: number
    weeklyDays: number[]
    monthlyDom: number
    monthlyLastDay: boolean
    everyN: number
    everyH: number
    everyM: number
  }): RecurrenceRule | null {
    const time = toTimeString(s.hour, s.minute)
    switch (s.preset) {
      case Preset.Daily:
        return { cron: buildDailyCron(time), tz }
      case Preset.Weekly:
        if (s.weeklyDays.length === 0) return null
        return { cron: buildCustomWeeklyCron(time, s.weeklyDays), tz }
      case Preset.Monthly:
        if (s.monthlyLastDay) return { cron: buildLastDayOfMonthCron(time), tz }
        return { cron: buildMonthlyCron(time, s.monthlyDom), tz }
      case Preset.EveryNDays:
        return { cron: buildCustomEveryNDaysCron(time, s.everyN), tz }
      case Preset.EveryNHoursMinutes:
        if (s.everyH === 0 && s.everyM === 0) return null
        return { cron: buildCustomEveryHMCron(s.everyH, s.everyM), tz }
    }
  }

  function emit(patch: Partial<typeof init>) {
    const s = { preset, hour, minute, weeklyDays, monthlyDom, monthlyLastDay, everyN, everyH, everyM, ...patch }
    const rule = buildRule(s)
    if (rule !== null) onChange(rule)
  }

  function handlePreset(p: Preset) {
    setPreset(p)
    emit({ preset: p })
  }

  function handleHour(h: number) { setHour(h); emit({ hour: h }) }
  function handleMinute(m: number) { setMinute(m); emit({ minute: m }) }

  function toggleDay(d: number) {
    const next = weeklyDays.includes(d) ? weeklyDays.filter((x) => x !== d) : [...weeklyDays, d]
    setWeeklyDays(next)
    emit({ weeklyDays: next })
  }

  function handleMonthlyDom(v: number) { setMonthlyDom(v); emit({ monthlyDom: v }) }
  function handleMonthlyLastDay(ld: boolean) { setMonthlyLastDay(ld); emit({ monthlyLastDay: ld }) }
  function handleEveryN(n: number) { setEveryN(n); emit({ everyN: n }) }
  function handleEveryH(h: number) { setEveryH(h); emit({ everyH: h }) }
  function handleEveryM(m: number) { setEveryM(m); emit({ everyM: m }) }

  const showTimeSpinners = preset !== Preset.EveryNHoursMinutes

  const currentRule = buildRule({ preset, hour, minute, weeklyDays, monthlyDom, monthlyLastDay, everyN, everyH, everyM })
  let nextText: string | null = null
  if (currentRule) {
    try {
      const next = nextOccurrence(currentRule.cron, tz, now)
      nextText = next.toLocaleString(undefined, {
        weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      })
    } catch {
      nextText = null
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <SelectField
        label="Schedule"
        aria-label="Schedule"
        value={preset}
        onChange={(v) => handlePreset(v as Preset)}
        variant="sub"
      >
        <option value={Preset.Daily}>Every day</option>
        <option value={Preset.Weekly}>Every week</option>
        <option value={Preset.Monthly}>Every month</option>
        <option value={Preset.EveryNDays}>Every N days</option>
        <option value={Preset.EveryNHoursMinutes}>Every N hours/minutes</option>
      </SelectField>

      {preset === Preset.Weekly && (
        <div className="flex gap-1">
          {DAYS.map((label, idx) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              onClick={() => toggleDay(idx)}
              className={`px-2 py-1 rounded text-xs font-medium ${
                weeklyDays.includes(idx) ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {preset === Preset.Monthly && (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={monthlyLastDay}
              onChange={(e) => handleMonthlyLastDay(e.target.checked)}
              aria-label="Last day of month"
            />
            Last day of month
          </label>
          {!monthlyLastDay && (
            <SpinnerField value={monthlyDom} onChange={handleMonthlyDom} min={1} max={31} clamp label="Day" />
          )}
        </div>
      )}

      {preset === Preset.EveryNDays && (
        <SpinnerField value={everyN} onChange={handleEveryN} min={2} max={90} clamp label="Every" />
      )}

      {preset === Preset.EveryNHoursMinutes && (
        <div className="flex gap-2">
          <SpinnerField value={everyH} onChange={handleEveryH} min={0} max={23} clamp label="Hours" />
          <SpinnerField value={everyM} onChange={handleEveryM} min={0} max={59} clamp label="Minutes" />
        </div>
      )}

      {showTimeSpinners && (
        <div className="flex gap-2">
          <SpinnerField value={hour} onChange={handleHour} min={0} max={23} clamp label="Hour" />
          <SpinnerField value={minute} onChange={handleMinute} min={0} max={59} clamp label="Minute" />
        </div>
      )}

      {nextText && (
        <p className="text-sm text-slate-400" data-testid="next-occurrence-preview">
          Next: {nextText}
        </p>
      )}
    </div>
  )
}
