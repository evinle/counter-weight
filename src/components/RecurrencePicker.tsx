import { useState } from 'react'
import {
  buildDailyCron,
  buildWeekdayCron,
  buildWeeklyCron,
  buildMonthlyCron,
  buildCustomWeeklyCron,
  buildCustomEveryNDaysCron,
  buildCustomEveryHMCron,
  parseCron,
} from '../lib/recurrence'
import { SpinnerField } from './SpinnerField'

type RecurrenceRule = { cron: string; tz: string }

const Preset = {
  Daily: 'daily',
  Weekday: 'weekday',
  Weekly: 'weekly',
  Monthly: 'monthly',
  Custom: 'custom',
} as const satisfies Record<string, string>
type Preset = typeof Preset[keyof typeof Preset]

const CustomFlavour = {
  Weekly: 'weekly',
  Monthly: 'monthly',
  EveryNDays: 'every-n-days',
  EveryNHoursMinutes: 'every-n-hours-minutes',
} as const satisfies Record<string, string>
type CustomFlavour = typeof CustomFlavour[keyof typeof CustomFlavour]

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

interface Props {
  value: RecurrenceRule | null
  targetDatetime: Date
  onChange: (rule: RecurrenceRule | null) => void
}

function parseTime(hhmm: string): { hour: number; minute: number } {
  const [h, m] = hhmm.split(':').map(Number)
  return { hour: h ?? 9, minute: m ?? 0 }
}

function initFromValue(value: RecurrenceRule | null): {
  preset: Preset
  hour: number
  minute: number
  customFlavour: CustomFlavour
  customDays: number[]
  customDom: number
  customEveryH: number
  customEveryM: number
} {
  const defaults = {
    preset: Preset.Daily,
    hour: 9,
    minute: 0,
    customFlavour: CustomFlavour.Weekly,
    customDays: [] as number[],
    customDom: 1,
    customEveryH: 2,
    customEveryM: 0,
  }

  if (!value) return defaults

  const parsed = parseCron(value.cron)
  if (!parsed) return defaults

  switch (parsed.preset) {
    case 'daily':
      return { ...defaults, preset: Preset.Daily, ...parseTime(parsed.time) }
    case 'weekday':
      return { ...defaults, preset: Preset.Weekday, ...parseTime(parsed.time) }
    case 'weekly':
      return { ...defaults, preset: Preset.Weekly, ...parseTime(parsed.time) }
    case 'monthly':
      return { ...defaults, preset: Preset.Monthly, ...parseTime(parsed.time) }
    case 'custom-weekly':
      return { ...defaults, preset: Preset.Custom, customFlavour: CustomFlavour.Weekly, ...parseTime(parsed.time), customDays: parsed.days }
    case 'custom-monthly':
      return { ...defaults, preset: Preset.Custom, customFlavour: CustomFlavour.Monthly, ...parseTime(parsed.time), customDom: parsed.dom }
    case 'custom-every-n-days':
      return { ...defaults, preset: Preset.Custom, customFlavour: CustomFlavour.EveryNDays, ...parseTime(parsed.time), customEveryH: parsed.n }
    case 'custom-every-hm':
      return { ...defaults, preset: Preset.Custom, customFlavour: CustomFlavour.EveryNHoursMinutes, customEveryH: parsed.hours, customEveryM: parsed.minutes }
  }
}

export function RecurrencePicker({ value, targetDatetime, onChange }: Props) {
  const init = initFromValue(value)
  const [preset, setPreset] = useState<Preset>(init.preset)
  const [hour, setHour] = useState(init.hour)
  const [minute, setMinute] = useState(init.minute)
  const [customFlavour, setCustomFlavour] = useState<CustomFlavour>(init.customFlavour)
  const [customDays, setCustomDays] = useState<number[]>(init.customDays)
  const [customDom, setCustomDom] = useState(init.customDom)
  const [customEveryH, setCustomEveryH] = useState(init.customEveryH)
  const [customEveryM, setCustomEveryM] = useState(init.customEveryM)

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const dow = targetDatetime.getUTCDay()
  const dom = targetDatetime.getUTCDate()

  function toTimeString(h: number, m: number) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  function buildRule(
    p: Preset,
    h: number,
    m: number,
    cf: CustomFlavour,
    cd: number[],
    cdom: number,
    ceh: number,
    cem: number,
  ): RecurrenceRule | null {
    const t = toTimeString(h, m)
    switch (p) {
      case Preset.Daily:   return { cron: buildDailyCron(t), tz }
      case Preset.Weekday: return { cron: buildWeekdayCron(t), tz }
      case Preset.Weekly:  return { cron: buildWeeklyCron(t, dow), tz }
      case Preset.Monthly: return { cron: buildMonthlyCron(t, dom), tz }
      case Preset.Custom:
        switch (cf) {
          case CustomFlavour.Weekly:
            if (cd.length === 0) return null
            return { cron: buildCustomWeeklyCron(t, cd), tz }
          case CustomFlavour.Monthly:
            return { cron: buildMonthlyCron(t, cdom), tz }
          case CustomFlavour.EveryNDays:
            return { cron: buildCustomEveryNDaysCron(t, ceh), tz }
          case CustomFlavour.EveryNHoursMinutes:
            if (ceh === 0 && cem === 0) return null
            return { cron: buildCustomEveryHMCron(ceh, cem), tz }
        }
    }
  }

  function emit(
    p: Preset,
    h: number,
    m: number,
    cf: CustomFlavour,
    cd: number[],
    cdom: number,
    ceh: number,
    cem: number,
  ) {
    const rule = buildRule(p, h, m, cf, cd, cdom, ceh, cem)
    if (rule !== null) onChange(rule)
  }

  function handlePreset(p: Preset) {
    setPreset(p)
    emit(p, hour, minute, customFlavour, customDays, customDom, customEveryH, customEveryM)
  }

  function handleHour(h: number) {
    setHour(h)
    emit(preset, h, minute, customFlavour, customDays, customDom, customEveryH, customEveryM)
  }

  function handleMinute(m: number) {
    setMinute(m)
    emit(preset, hour, m, customFlavour, customDays, customDom, customEveryH, customEveryM)
  }

  function handleCustomFlavour(cf: CustomFlavour) {
    setCustomFlavour(cf)
    emit(preset, hour, minute, cf, customDays, customDom, customEveryH, customEveryM)
  }

  function toggleDay(d: number) {
    const next = customDays.includes(d)
      ? customDays.filter((x) => x !== d)
      : [...customDays, d]
    setCustomDays(next)
    emit(preset, hour, minute, customFlavour, next, customDom, customEveryH, customEveryM)
  }

  function handleDom(v: number) {
    setCustomDom(v)
    emit(preset, hour, minute, customFlavour, customDays, v, customEveryH, customEveryM)
  }

  function handleEveryH(v: number) {
    setCustomEveryH(v)
    emit(preset, hour, minute, customFlavour, customDays, customDom, v, customEveryM)
  }

  function handleEveryM(v: number) {
    setCustomEveryM(v)
    emit(preset, hour, minute, customFlavour, customDays, customDom, customEveryH, v)
  }

  const showTimeInput = !(preset === Preset.Custom && customFlavour === CustomFlavour.EveryNHoursMinutes)

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-sm text-slate-400">Schedule</span>
        <select
          aria-label="Recurrence"
          value={preset}
          onChange={(e) => handlePreset(e.target.value as Preset)}
          className="bg-slate-700 text-white text-sm rounded px-2 py-1"
        >
          <option value={Preset.Daily}>Every day</option>
          <option value={Preset.Weekday}>Every weekday</option>
          <option value={Preset.Weekly}>Every week</option>
          <option value={Preset.Monthly}>Every month</option>
          <option value={Preset.Custom}>Custom</option>
        </select>
      </label>

      {showTimeInput && (
        <div className="flex flex-col gap-1">
          <span className="text-sm text-slate-400">Time of day</span>
          <div className="flex gap-2">
            <SpinnerField value={hour} onChange={handleHour} min={0} max={23} clamp label="Hour" />
            <SpinnerField value={minute} onChange={handleMinute} min={0} max={59} clamp label="Minute" />
          </div>
        </div>
      )}

      {preset === Preset.Custom && (
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-400">Repeat</span>
          <select
            aria-label="Repeat"
            value={customFlavour}
            onChange={(e) => handleCustomFlavour(e.target.value as CustomFlavour)}
            className="bg-slate-700 text-white text-sm rounded px-2 py-1"
          >
            <option value={CustomFlavour.Weekly}>Weekly</option>
            <option value={CustomFlavour.Monthly}>Monthly</option>
            <option value={CustomFlavour.EveryNDays}>Every N days</option>
            <option value={CustomFlavour.EveryNHoursMinutes}>Every N hours/minutes</option>
          </select>
        </label>
      )}

      {preset === Preset.Custom && customFlavour === CustomFlavour.Weekly && (
        <div className="flex gap-1">
          {DAYS.map((label, idx) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              onClick={() => toggleDay(idx)}
              className={`px-2 py-1 rounded text-xs font-medium ${
                customDays.includes(idx)
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {preset === Preset.Custom && customFlavour === CustomFlavour.Monthly && (
        <div className="flex flex-col gap-1">
          <span className="text-sm text-slate-400">Day of month</span>
          <div className="flex">
            <SpinnerField value={customDom} onChange={handleDom} min={1} max={28} clamp label="Day" />
          </div>
        </div>
      )}

      {preset === Preset.Custom && customFlavour === CustomFlavour.EveryNDays && (
        <div className="flex">
          <SpinnerField value={customEveryH} onChange={handleEveryH} min={2} max={90} clamp label="Every" />
        </div>
      )}

      {preset === Preset.Custom && customFlavour === CustomFlavour.EveryNHoursMinutes && (
        <div className="flex gap-2">
          <SpinnerField value={customEveryH} onChange={handleEveryH} min={0} max={23} clamp label="Hours" />
          <SpinnerField value={customEveryM} onChange={handleEveryM} min={0} max={59} clamp label="Minutes" />
        </div>
      )}
    </div>
  )
}
