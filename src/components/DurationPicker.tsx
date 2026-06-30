import { useState, useRef, useEffect } from "react";
import { ClockDial } from "./ClockDial";
import type { DialPhase } from "./ClockDial";

const DAY_MS = 24 * 60 * 60 * 1000;

interface DurationValue {
  days: number;
  hours: number;
  minutes: number;
}

interface Props {
  value: DurationValue;
  onChange: (v: DurationValue) => void;
  maxDays?: number;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function edgeLabel(date: Date, offsetDays: number): string {
  const formatted = date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return `${formatted} · +${offsetDays}d`;
}

function hoursTo12h(h: number): { hour: number; isPm: boolean } {
  return { hour: h % 12 || 12, isPm: h >= 12 };
}

function hour12To24(hour12: number, isPm: boolean): number {
  return isPm ? (hour12 % 12) + 12 : hour12 % 12;
}

export function DurationPicker({ value, onChange, maxDays = 28 }: Props) {
  // Dial internal state — synced from value prop
  const { hour: initHour12, isPm: initIsPm } = hoursTo12h(value.hours);
  const [phase, setPhase] = useState<DialPhase>("hour");
  const [dialHour, setDialHour] = useState(initHour12);
  const [dialMinute, setDialMinute] = useState(value.minutes);
  const [dialIsPm, setDialIsPm] = useState(initIsPm);

  // Sync dial state when value prop changes externally
  const prevValue = useRef(value);
  useEffect(() => {
    if (prevValue.current !== value) {
      prevValue.current = value;
      const { hour: h12, isPm } = hoursTo12h(value.hours);
      setDialHour(h12);
      setDialMinute(value.minutes);
      setDialIsPm(isPm);
      setPhase("hour");
    }
  }, [value]);

  function handleHourConfirm(h: number): void {
    setDialHour(h);
    setPhase("minute");
    const h24 = hour12To24(h, dialIsPm);
    onChange({ ...value, hours: h24 });
  }

  function handleMinuteConfirm(m: number): void {
    setDialMinute(m);
    // stays on minute phase
    onChange({ ...value, minutes: m });
  }

  function handleToggleAmPm(): void {
    setDialIsPm((prev) => {
      const next = !prev;
      const h24 = hour12To24(dialHour, next);
      onChange({ ...value, hours: h24 });
      return next;
    });
  }

  const today = new Date();
  const todayStart = startOfDay(today);
  const leftEdgeDate = todayStart;
  const rightEdgeDate = new Date(todayStart.getTime() + maxDays * DAY_MS);
  const leftEdgeLabel = edgeLabel(leftEdgeDate, 0);
  const rightEdgeLabel = edgeLabel(rightEdgeDate, maxDays);

  return (
    <div className="flex flex-col gap-4">
      {/* Days slider */}
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-200">
          {value.days} {value.days === 1 ? "day" : "days"}
          {" · "}
          {new Date(todayStart.getTime() + value.days * DAY_MS).toLocaleDateString("en-GB", {
            weekday: "short",
            day: "numeric",
            month: "short",
          })}
        </span>
        <input
          type="range"
          min={0}
          max={maxDays}
          step={1}
          value={value.days}
          onChange={(e) => onChange({ ...value, days: Number(e.target.value) })}
          className="w-full accent-blue-500 py-2"
          aria-label="Days"
        />
        <div className="flex justify-between">
          <span className="text-xs text-slate-400">{leftEdgeLabel}</span>
          <span className="text-xs text-slate-400">{rightEdgeLabel}</span>
        </div>
      </div>

      {/* Clock dial for hours and minutes */}
      <ClockDial
        mode="interval"
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
