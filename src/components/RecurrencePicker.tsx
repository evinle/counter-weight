import { useState } from 'react'
import {
  buildDailyCron,
  buildWeekdayCron,
  buildWeeklyCron,
  buildMonthlyCron,
  buildCustomWeeklyCron,
  buildCustomEveryNDaysCron,
  buildCustomEveryNHoursCron,
  buildCustomEveryNMinutesCron,
  parseCron,
} from '../lib/recurrence'

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

const HourMinuteUnit = {
  Hours: 'hours',
  Minutes: 'minutes',
} as const satisfies Record<string, string>
type HourMinuteUnit = typeof HourMinuteUnit[keyof typeof HourMinuteUnit]

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

interface Props {
  value: RecurrenceRule | null
  targetDatetime: Date
  onChange: (rule: RecurrenceRule | null) => void
}

function initFromValue(value: RecurrenceRule | null): {
  preset: Preset
  time: string
  customFlavour: CustomFlavour
  customDays: number[]
  customDom: number
  customN: number
  customUnit: HourMinuteUnit
} {
  const defaults = {
    preset: Preset.Daily,
    time: '09:00',
    customFlavour: CustomFlavour.Weekly,
    customDays: [] as number[],
    customDom: 1,
    customN: 2,
    customUnit: HourMinuteUnit.Hours,
  }

  if (!value) return defaults

  const parsed = parseCron(value.cron)
  if (!parsed) return defaults

  switch (parsed.preset) {
    case 'daily':
      return { ...defaults, preset: Preset.Daily, time: parsed.time }
    case 'weekday':
      return { ...defaults, preset: Preset.Weekday, time: parsed.time }
    case 'weekly':
      return { ...defaults, preset: Preset.Weekly, time: parsed.time }
    case 'monthly':
      return { ...defaults, preset: Preset.Monthly, time: parsed.time }
    case 'custom-weekly':
      return { ...defaults, preset: Preset.Custom, customFlavour: CustomFlavour.Weekly, time: parsed.time, customDays: parsed.days }
    case 'custom-monthly':
      return { ...defaults, preset: Preset.Custom, customFlavour: CustomFlavour.Monthly, time: parsed.time, customDom: parsed.dom }
    case 'custom-every-n-days':
      return { ...defaults, preset: Preset.Custom, customFlavour: CustomFlavour.EveryNDays, time: parsed.time, customN: parsed.n }
    case 'custom-every-n-hours':
      return { ...defaults, preset: Preset.Custom, customFlavour: CustomFlavour.EveryNHoursMinutes, customN: parsed.n, customUnit: HourMinuteUnit.Hours }
    case 'custom-every-n-minutes':
      return { ...defaults, preset: Preset.Custom, customFlavour: CustomFlavour.EveryNHoursMinutes, customN: parsed.n, customUnit: HourMinuteUnit.Minutes }
  }
}

export function RecurrencePicker({ value, targetDatetime, onChange }: Props) {
  const init = initFromValue(value)
  const [preset, setPreset] = useState<Preset>(init.preset)
  const [time, setTime] = useState(init.time)
  const [customFlavour, setCustomFlavour] = useState<CustomFlavour>(init.customFlavour)
  const [customDays, setCustomDays] = useState<number[]>(init.customDays)
  const [customDom, setCustomDom] = useState(init.customDom)
  const [customN, setCustomN] = useState(init.customN)
  const [customUnit, setCustomUnit] = useState<HourMinuteUnit>(init.customUnit)

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const dow = targetDatetime.getUTCDay()
  const dom = targetDatetime.getUTCDate()

  function buildRule(
    p: Preset,
    t: string,
    cf: CustomFlavour,
    cd: number[],
    cdom: number,
    cn: number,
    cu: HourMinuteUnit,
  ): RecurrenceRule | null {
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
            return { cron: buildCustomEveryNDaysCron(t, cn), tz }
          case CustomFlavour.EveryNHoursMinutes:
            return cu === HourMinuteUnit.Hours
              ? { cron: buildCustomEveryNHoursCron(cn), tz }
              : { cron: buildCustomEveryNMinutesCron(cn), tz }
        }
    }
  }

  function emit(
    p: Preset,
    t: string,
    cf: CustomFlavour,
    cd: number[],
    cdom: number,
    cn: number,
    cu: HourMinuteUnit,
  ) {
    const rule = buildRule(p, t, cf, cd, cdom, cn, cu)
    if (rule !== null) onChange(rule)
  }

  function handlePreset(p: Preset) {
    setPreset(p)
    emit(p, time, customFlavour, customDays, customDom, customN, customUnit)
  }

  function handleTime(t: string) {
    setTime(t)
    emit(preset, t, customFlavour, customDays, customDom, customN, customUnit)
  }

  function handleCustomFlavour(cf: CustomFlavour) {
    setCustomFlavour(cf)
    emit(preset, time, cf, customDays, customDom, customN, customUnit)
  }

  function toggleDay(d: number) {
    const next = customDays.includes(d)
      ? customDays.filter((x) => x !== d)
      : [...customDays, d]
    setCustomDays(next)
    emit(preset, time, customFlavour, next, customDom, customN, customUnit)
  }

  function handleDom(v: number) {
    setCustomDom(v)
    emit(preset, time, customFlavour, customDays, v, customN, customUnit)
  }

  function handleN(v: number) {
    setCustomN(v)
    emit(preset, time, customFlavour, customDays, customDom, v, customUnit)
  }

  function handleUnit(u: HourMinuteUnit) {
    setCustomUnit(u)
    emit(preset, time, customFlavour, customDays, customDom, customN, u)
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
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-400">Time of day</span>
          <input
            type="time"
            aria-label="Time of day"
            value={time}
            onChange={(e) => handleTime(e.target.value)}
            className="bg-slate-700 text-white text-sm rounded px-2 py-1"
          />
        </label>
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
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-400">Day of month</span>
          <input
            type="number"
            aria-label="Day of month"
            value={customDom}
            min={1}
            max={28}
            onChange={(e) => handleDom(Number(e.target.value))}
            className="bg-slate-700 text-white text-sm rounded px-2 py-1 w-20"
          />
        </label>
      )}

      {preset === Preset.Custom && (
        customFlavour === CustomFlavour.EveryNDays ||
        customFlavour === CustomFlavour.EveryNHoursMinutes
      ) && (
        <div className="flex gap-2 items-end">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-400">Every</span>
            <input
              type="number"
              aria-label="Every"
              value={customN}
              min={customFlavour === CustomFlavour.EveryNHoursMinutes
                ? 1
                : 2}
              max={customFlavour === CustomFlavour.EveryNHoursMinutes
                ? (customUnit === HourMinuteUnit.Hours ? 23 : 59)
                : 90}
              onChange={(e) => handleN(Number(e.target.value))}
              className="bg-slate-700 text-white text-sm rounded px-2 py-1 w-20"
            />
          </label>
          {customFlavour === CustomFlavour.EveryNHoursMinutes && (
            <label className="flex flex-col gap-1">
              <span className="text-sm text-slate-400">Unit</span>
              <select
                aria-label="Unit"
                value={customUnit}
                onChange={(e) => handleUnit(e.target.value as HourMinuteUnit)}
                className="bg-slate-700 text-white text-sm rounded px-2 py-1"
              >
                <option value={HourMinuteUnit.Hours}>Hours</option>
                <option value={HourMinuteUnit.Minutes}>Minutes</option>
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  )
}
