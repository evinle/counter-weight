import { useState } from 'react'
import {
  buildDailyCron,
  buildWeeklyCron,
  buildMonthlyCron,
  buildLastDayOfMonthCron,
  buildCustomWeeklyCron,
  buildCustomEveryNDaysCron,
  buildCustomEveryHMCron,
  parseCron,
} from '../lib/recurrence'
import { SpinnerField } from './SpinnerField'

type RecurrenceRule = { cron: string; tz: string }

const Preset = {
  Daily: 'daily',
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
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

interface Props {
  value: RecurrenceRule | null
  targetDatetime: Date
  onChange: (rule: RecurrenceRule | null) => void
}

function toTimeString(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function parseHHMM(hhmm: string): { hour: number; minute: number } {
  const [h, m] = hhmm.split(':').map(Number)
  return { hour: h ?? 9, minute: m ?? 0 }
}

function initFromValue(
  value: RecurrenceRule | null,
  targetDatetime: Date,
): {
  preset: Preset
  customFlavour: CustomFlavour
  monthlyDom: number
  monthlyLastDay: boolean
  customDays: number[]
  customDom: number
  customLastDay: boolean
  customHour: number
  customMinute: number
  customEveryN: number
  customEveryH: number
  customEveryM: number
} {
  const tDow = targetDatetime.getUTCDay()
  const tDom = targetDatetime.getUTCDate()
  const tHour = targetDatetime.getUTCHours()
  const tMinute = targetDatetime.getUTCMinutes()

  const defaults = {
    preset: Preset.Daily as Preset,
    customFlavour: CustomFlavour.Weekly as CustomFlavour,
    monthlyDom: tDom,
    monthlyLastDay: false,
    customDays: [] as number[],
    customDom: tDom,
    customLastDay: false,
    customHour: tHour,
    customMinute: tMinute,
    customEveryN: 2,
    customEveryH: 2,
    customEveryM: 0,
  }

  if (!value) return defaults

  const parsed = parseCron(value.cron)
  if (!parsed) return defaults

  switch (parsed.preset) {
    case 'daily':
      return { ...defaults, preset: Preset.Daily }
    case 'weekday':
      return { ...defaults, preset: Preset.Custom, customFlavour: CustomFlavour.Weekly, ...parseHHMM(parsed.time), customDays: [1, 2, 3, 4, 5] }
    case 'weekly':
      return { ...defaults, preset: Preset.Weekly }
    case 'monthly':
      return { ...defaults, preset: Preset.Monthly, monthlyDom: tDom }
    case 'custom-weekly': {
      const { hour, minute } = parseHHMM(parsed.time)
      return { ...defaults, preset: Preset.Custom, customFlavour: CustomFlavour.Weekly, customHour: hour, customMinute: minute, customDays: parsed.days }
    }
    case 'custom-monthly': {
      const { hour, minute } = parseHHMM(parsed.time)
      if (parsed.dom === 'L') {
        return { ...defaults, preset: Preset.Monthly, monthlyLastDay: true }
      }
      return { ...defaults, preset: Preset.Custom, customFlavour: CustomFlavour.Monthly, customHour: hour, customMinute: minute, customDom: parsed.dom }
    }
    case 'custom-every-n-days': {
      const { hour, minute } = parseHHMM(parsed.time)
      return { ...defaults, preset: Preset.Custom, customFlavour: CustomFlavour.EveryNDays, customHour: hour, customMinute: minute, customEveryN: parsed.n }
    }
    case 'custom-every-hm':
      return { ...defaults, preset: Preset.Custom, customFlavour: CustomFlavour.EveryNHoursMinutes, customEveryH: parsed.hours, customEveryM: parsed.minutes }
  }

  // backwards compat: old 'monthly' parsed rule maps monthly dom from targetDatetime
  const { hour, minute } = parseHHMM('parsed' in parsed ? (parsed as { time: string }).time : '09:00')
  return { ...defaults, preset: Preset.Monthly, monthlyDom: tDom, customHour: hour, customMinute: minute }
}

export function RecurrencePicker({ value, targetDatetime, onChange }: Props) {
  const init = initFromValue(value, targetDatetime)
  const [preset, setPreset] = useState<Preset>(init.preset)
  const [monthlyDom, setMonthlyDom] = useState(init.monthlyDom)
  const [monthlyLastDay, setMonthlyLastDay] = useState(init.monthlyLastDay)
  const [customFlavour, setCustomFlavour] = useState<CustomFlavour>(init.customFlavour)
  const [customDays, setCustomDays] = useState<number[]>(init.customDays)
  const [customDom, setCustomDom] = useState(init.customDom)
  const [customLastDay, setCustomLastDay] = useState(init.customLastDay)
  const [customHour, setCustomHour] = useState(init.customHour)
  const [customMinute, setCustomMinute] = useState(init.customMinute)
  const [customEveryN, setCustomEveryN] = useState(init.customEveryN)
  const [customEveryH, setCustomEveryH] = useState(init.customEveryH)
  const [customEveryM, setCustomEveryM] = useState(init.customEveryM)

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const dow = targetDatetime.getUTCDay()
  const dom = targetDatetime.getUTCDate()
  const tTime = toTimeString(targetDatetime.getUTCHours(), targetDatetime.getUTCMinutes())

  function buildRule(
    p: Preset,
    mDom: number,
    mLast: boolean,
    cf: CustomFlavour,
    cd: number[],
    cdom: number,
    cLast: boolean,
    ch: number,
    cm: number,
    cN: number,
    cH: number,
    cM: number,
  ): RecurrenceRule | null {
    const customTime = toTimeString(ch, cm)
    switch (p) {
      case Preset.Daily:
        return { cron: buildDailyCron(tTime), tz }
      case Preset.Weekly:
        return { cron: buildWeeklyCron(tTime, dow), tz }
      case Preset.Monthly:
        if (mLast) return { cron: buildLastDayOfMonthCron(tTime), tz }
        return { cron: buildMonthlyCron(tTime, mDom), tz }
      case Preset.Custom:
        switch (cf) {
          case CustomFlavour.Weekly:
            if (cd.length === 0) return null
            return { cron: buildCustomWeeklyCron(customTime, cd), tz }
          case CustomFlavour.Monthly:
            if (cLast) return { cron: buildLastDayOfMonthCron(customTime), tz }
            return { cron: buildMonthlyCron(customTime, cdom), tz }
          case CustomFlavour.EveryNDays:
            return { cron: buildCustomEveryNDaysCron(customTime, cN), tz }
          case CustomFlavour.EveryNHoursMinutes:
            if (cH === 0 && cM === 0) return null
            return { cron: buildCustomEveryHMCron(cH, cM), tz }
        }
    }
  }

  function emit(
    p: Preset,
    mDom: number,
    mLast: boolean,
    cf: CustomFlavour,
    cd: number[],
    cdom: number,
    cLast: boolean,
    ch: number,
    cm: number,
    cN: number,
    cH: number,
    cM: number,
  ) {
    const rule = buildRule(p, mDom, mLast, cf, cd, cdom, cLast, ch, cm, cN, cH, cM)
    if (rule !== null) onChange(rule)
  }

  function handlePreset(p: Preset) {
    setPreset(p)
    emit(p, monthlyDom, monthlyLastDay, customFlavour, customDays, customDom, customLastDay, customHour, customMinute, customEveryN, customEveryH, customEveryM)
  }

  function handleMonthlyDom(v: number) {
    setMonthlyDom(v)
    emit(preset, v, monthlyLastDay, customFlavour, customDays, customDom, customLastDay, customHour, customMinute, customEveryN, customEveryH, customEveryM)
  }

  function handleMonthlyLastDay(ld: boolean) {
    setMonthlyLastDay(ld)
    emit(preset, monthlyDom, ld, customFlavour, customDays, customDom, customLastDay, customHour, customMinute, customEveryN, customEveryH, customEveryM)
  }

  function handleCustomFlavour(cf: CustomFlavour) {
    setCustomFlavour(cf)
    emit(preset, monthlyDom, monthlyLastDay, cf, customDays, customDom, customLastDay, customHour, customMinute, customEveryN, customEveryH, customEveryM)
  }

  function toggleDay(d: number) {
    const next = customDays.includes(d)
      ? customDays.filter((x) => x !== d)
      : [...customDays, d]
    setCustomDays(next)
    emit(preset, monthlyDom, monthlyLastDay, customFlavour, next, customDom, customLastDay, customHour, customMinute, customEveryN, customEveryH, customEveryM)
  }

  function handleCustomDom(v: number) {
    setCustomDom(v)
    emit(preset, monthlyDom, monthlyLastDay, customFlavour, customDays, v, customLastDay, customHour, customMinute, customEveryN, customEveryH, customEveryM)
  }

  function handleCustomLastDay(ld: boolean) {
    setCustomLastDay(ld)
    emit(preset, monthlyDom, monthlyLastDay, customFlavour, customDays, customDom, ld, customHour, customMinute, customEveryN, customEveryH, customEveryM)
  }

  function handleCustomHour(h: number) {
    setCustomHour(h)
    emit(preset, monthlyDom, monthlyLastDay, customFlavour, customDays, customDom, customLastDay, h, customMinute, customEveryN, customEveryH, customEveryM)
  }

  function handleCustomMinute(m: number) {
    setCustomMinute(m)
    emit(preset, monthlyDom, monthlyLastDay, customFlavour, customDays, customDom, customLastDay, customHour, m, customEveryN, customEveryH, customEveryM)
  }

  function handleCustomEveryN(n: number) {
    setCustomEveryN(n)
    emit(preset, monthlyDom, monthlyLastDay, customFlavour, customDays, customDom, customLastDay, customHour, customMinute, n, customEveryH, customEveryM)
  }

  function handleCustomEveryH(h: number) {
    setCustomEveryH(h)
    emit(preset, monthlyDom, monthlyLastDay, customFlavour, customDays, customDom, customLastDay, customHour, customMinute, customEveryN, h, customEveryM)
  }

  function handleCustomEveryM(m: number) {
    setCustomEveryM(m)
    emit(preset, monthlyDom, monthlyLastDay, customFlavour, customDays, customDom, customLastDay, customHour, customMinute, customEveryN, customEveryH, m)
  }

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
          <option value={Preset.Weekly}>Every {DAY_NAMES[dow]}</option>
          <option value={Preset.Monthly}>Every month</option>
          <option value={Preset.Custom}>Custom</option>
        </select>
      </label>

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
            <div className="flex flex-col gap-1">
              <span className="text-sm text-slate-400">Day of month</span>
              <div className="flex">
                <SpinnerField value={monthlyDom} onChange={handleMonthlyDom} min={1} max={31} clamp label="Day" />
              </div>
            </div>
          )}
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
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={customLastDay}
              onChange={(e) => handleCustomLastDay(e.target.checked)}
              aria-label="Last day of month"
            />
            Last day of month
          </label>
          {!customLastDay && (
            <div className="flex flex-col gap-1">
              <span className="text-sm text-slate-400">Day of month</span>
              <div className="flex">
                <SpinnerField value={customDom} onChange={handleCustomDom} min={1} max={31} clamp label="Day" />
              </div>
            </div>
          )}
        </div>
      )}

      {preset === Preset.Custom && customFlavour === CustomFlavour.EveryNDays && (
        <div className="flex">
          <SpinnerField value={customEveryN} onChange={handleCustomEveryN} min={2} max={90} clamp label="Every" />
        </div>
      )}

      {preset === Preset.Custom && customFlavour === CustomFlavour.EveryNHoursMinutes && (
        <div className="flex gap-2">
          <SpinnerField value={customEveryH} onChange={handleCustomEveryH} min={0} max={23} clamp label="Hours" />
          <SpinnerField value={customEveryM} onChange={handleCustomEveryM} min={0} max={59} clamp label="Minutes" />
        </div>
      )}

      {preset === Preset.Custom && customFlavour !== CustomFlavour.EveryNHoursMinutes && (
        <div className="flex flex-col gap-1">
          <span className="text-sm text-slate-400">Time of day</span>
          <div className="flex gap-2">
            <SpinnerField value={customHour} onChange={handleCustomHour} min={0} max={23} clamp label="Hour" />
            <SpinnerField value={customMinute} onChange={handleCustomMinute} min={0} max={59} clamp label="Minute" />
          </div>
        </div>
      )}
    </div>
  )
}
