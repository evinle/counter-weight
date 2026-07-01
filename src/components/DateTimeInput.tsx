import { useState, useRef, useEffect } from "react";
import { useDatetimeConstraints } from "../hooks/useDatetimeConstraints";
import type { DateFields } from "../hooks/useDatetimeConstraints";
import { to12h, to24h } from "./clockMath";
import { ClockDial } from "./ClockDial";
import type { DialPhase } from "./ClockDial";

interface Props {
  value: Date;
  onChange: (date: Date) => void;
  maxDate?: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayLabel(date: Date, today: Date): string {
  const diffDays = Math.round(
    (startOfDay(date).getTime() - startOfDay(today).getTime()) / DAY_MS,
  );
  const suffix = ` · +${diffDays}d`;
  if (diffDays === 0) return `Today${suffix}`;
  if (diffDays === 1) return `Tomorrow${suffix}`;
  return (
    date.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    }) + suffix
  );
}

function edgeLabel(date: Date, offsetDays: number): string {
  const formatted = date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return `${formatted} · +${offsetDays}d`;
}

export function DateTimeInput({ value, onChange, maxDate }: Props) {
  const today = new Date();
  const todayStart = startOfDay(today);

  const valueStart = startOfDay(value);
  const sliderValue = Math.round(
    (valueStart.getTime() - todayStart.getTime()) / DAY_MS,
  );
  const clampedSlider = Math.max(0, Math.min(28, sliderValue));

  const fields: DateFields = {
    year: value.getFullYear(),
    month: value.getMonth() + 1,
    day: value.getDate(),
    hour: value.getHours(),
    minute: value.getMinutes(),
  };

  const { constrain } = useDatetimeConstraints(fields, maxDate);

  function emitDate(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
  ): void {
    const raw = new Date(year, month - 1, day, hour, minute, 0);
    onChange(constrain(raw));
  }

  function handleSliderChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const days = Number(e.target.value);
    const newStart = new Date(todayStart.getTime() + days * DAY_MS);
    emitDate(
      newStart.getFullYear(),
      newStart.getMonth() + 1,
      newStart.getDate(),
      value.getHours(),
      value.getMinutes(),
    );
  }

  function handleNativeDateChange(
    e: React.ChangeEvent<HTMLInputElement>,
  ): void {
    if (!e.target.value) return;
    const [y, m, d] = e.target.value.split("-").map(Number);
    emitDate(y, m, d, value.getHours(), value.getMinutes());
  }

  // Clock dial state — derived from value prop, with local overrides during interaction
  const { hour: hour12, minute, isPm } = to12h(value);
  const [phase, setPhase] = useState<DialPhase>("hour");
  const [dialHour, setDialHour] = useState(hour12);
  const [dialMinute, setDialMinute] = useState(minute);
  const [dialIsPm, setDialIsPm] = useState(isPm);

  // Sync dial state when value prop changes externally
  const prevValue = useRef(value);
  useEffect(() => {
    if (prevValue.current !== value) {
      prevValue.current = value;
      const updated = to12h(value);
      setDialHour(updated.hour);
      setDialMinute(updated.minute);
      setDialIsPm(updated.isPm);
    }
  }, [value]);

  function handleHourConfirm(h: number): void {
    setDialHour(h);
    const { hour: h24, minute: min } = to24h(h, dialMinute, dialIsPm);
    emitDate(fields.year, fields.month, fields.day, h24, min);
  }

  function handleMinuteConfirm(m: number): void {
    setDialMinute(m);
    const { hour: h24, minute: min } = to24h(dialHour, m, dialIsPm);
    emitDate(fields.year, fields.month, fields.day, h24, min);
  }

  function handleToggleAmPm(): void {
    setDialIsPm((prev) => {
      const next = !prev;
      const { hour: h24, minute: min } = to24h(dialHour, dialMinute, next);
      emitDate(fields.year, fields.month, fields.day, h24, min);
      return next;
    });
  }

  const nativeDateValue = `${String(value.getFullYear()).padStart(4, "0")}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

  // Edge labels: computed once per render from today
  const leftEdgeDate = todayStart;
  const rightEdgeDate = new Date(todayStart.getTime() + 28 * DAY_MS);
  const leftEdgeLabel = edgeLabel(leftEdgeDate, 0);
  const rightEdgeLabel = edgeLabel(rightEdgeDate, 28);

  return (
    <div className="flex flex-col gap-4">
      {/* Day slider */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-200">
            {dayLabel(value, today)}
          </span>
          <div className="relative ml-auto">
            <button
              type="button"
              aria-label="Open calendar"
              className="text-slate-400 hover:text-slate-200"
            >
              📅
            </button>
            <input
              type="date"
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              value={nativeDateValue}
              onChange={handleNativeDateChange}
            />
          </div>
        </div>
        <div className="py-3">
          <input
            type="range"
            min={0}
            max={28}
            value={clampedSlider}
            onChange={handleSliderChange}
            className="w-full accent-blue-500"
            aria-label="Day"
          />
        </div>
        <div className="flex justify-between">
          <span className="text-xs text-slate-400">{leftEdgeLabel}</span>
          <span className="text-xs text-slate-400">{rightEdgeLabel}</span>
        </div>
      </div>

      {/* Clock dial */}
      <ClockDial
        mode="time-of-day"
        phase={phase}
        selectedHour={dialHour}
        selectedMinute={dialMinute}
        isPm={dialIsPm}
        onHourConfirm={handleHourConfirm}
        onMinuteConfirm={handleMinuteConfirm}
        onPhaseSelect={setPhase}
        onToggleAmPm={handleToggleAmPm}
      />
    </div>
  );
}
