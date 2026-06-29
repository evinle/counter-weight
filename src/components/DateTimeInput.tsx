import { useState, useRef, useCallback, useEffect } from "react";
import { useDatetimeConstraints } from "../hooks/useDatetimeConstraints";
import type { DateFields } from "../hooks/useDatetimeConstraints";
import {
  angleToHour,
  angleToMinute,
  pointToAngle,
  to12h,
  to24h,
} from "./clockMath";

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
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

type DialPhase = "hour" | "minute";

const HOUR_LABELS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTE_LABELS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function labelAngle(index: number): number {
  return (index / 12) * 360;
}

interface DialProps {
  value: Date;
  phase: DialPhase;
  selectedHour: number; // 1–12
  selectedMinute: number; // 0–59
  isPm: boolean;
  onHourConfirm: (hour: number) => void;
  onMinuteConfirm: (minute: number) => void;
  onPhaseSelect: (phase: DialPhase) => void;
  onToggleAmPm: () => void;
}

function ClockDial({
  phase,
  selectedHour,
  selectedMinute,
  isPm,
  onHourConfirm,
  onMinuteConfirm,
  onPhaseSelect,
  onToggleAmPm,
}: DialProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [liveAngle, setLiveAngle] = useState<number | null>(null);
  const dragging = useRef(false);

  // Prevent page scroll while the user drags on the dial.
  // React registers touch handlers as passive, so preventDefault() in synthetic
  // handlers is a no-op. Attaching a non-passive listener directly is the fix.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const prevent = (e: TouchEvent) => e.preventDefault();
    el.addEventListener("touchmove", prevent, { passive: false });
    return () => {
      el.removeEventListener("touchmove", prevent);
    };
  }, []);

  const SIZE = 240;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const LABEL_R = 88;
  const HAND_R = 80;
  // Radius of the center display area — pointer events here are swipe, not drag
  const CENTER_R = 52;

  function getSvgCenter(): { cx: number; cy: number } {
    const rect = svgRef.current?.getBoundingClientRect() ?? {
      left: 0,
      top: 0,
      width: SIZE,
      height: SIZE,
    };
    return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
  }

  function angleFromEvent(e: React.PointerEvent): number {
    const { cx, cy } = getSvgCenter();
    return pointToAngle(e.clientX, e.clientY, cx, cy);
  }

  function isInCenter(e: React.PointerEvent): boolean {
    const { cx, cy } = getSvgCenter();
    return Math.hypot(e.clientX - cx, e.clientY - cy) < CENTER_R;
  }

  // AM/PM swipe tracking — detected by SVG when pointerDown is in center region
  const swipeStartX = useRef<number | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (isInCenter(e)) {
      swipeStartX.current = e.clientX;
    } else {
      dragging.current = true;
      setLiveAngle(angleFromEvent(e));
    }
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    setLiveAngle(angleFromEvent(e));
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (dragging.current) {
        dragging.current = false;
        const angle = angleFromEvent(e);
        setLiveAngle(null);
        if (phase === "hour") {
          onHourConfirm(angleToHour(angle));
        } else {
          onMinuteConfirm(angleToMinute(angle));
        }
      } else if (swipeStartX.current !== null) {
        const dx = e.clientX - swipeStartX.current;
        swipeStartX.current = null;
        if (Math.abs(dx) > 30) {
          onToggleAmPm();
        }
      }
    },
    [phase, onHourConfirm, onMinuteConfirm, onToggleAmPm],
  );

  const activeAngle =
    liveAngle !== null
      ? liveAngle
      : phase === "hour"
        ? ((selectedHour % 12) / 12) * 360
        : (selectedMinute / 60) * 360;

  const handX = CX + HAND_R * Math.sin((activeAngle * Math.PI) / 180);
  const handY = CY - HAND_R * Math.cos((activeAngle * Math.PI) / 180);

  const labels = phase === "hour" ? HOUR_LABELS : MINUTE_LABELS;

  const hourDisplay = selectedHour;
  const minuteDisplay = String(selectedMinute).padStart(2, "0");

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        ref={svgRef}
        width={SIZE}
        height={SIZE}
        data-testid="dial-face"
        className="cursor-pointer touch-none"
        onMouseDown={(e) => e.preventDefault()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Dial face */}
        <circle
          cx={CX}
          cy={CY}
          r={CX - 4}
          className="fill-slate-700 stroke-slate-600"
          strokeWidth={1}
        />

        {/* Hour/minute labels */}
        {labels.map((val, i) => {
          const angle = labelAngle(i);
          const x = CX + LABEL_R * Math.sin((angle * Math.PI) / 180);
          const y = CY - LABEL_R * Math.cos((angle * Math.PI) / 180);
          const testId =
            phase === "hour" ? `hour-label-${val}` : `minute-label-${val}`;
          return (
            <text
              key={val}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              data-testid={testId}
              className="fill-slate-200 text-sm select-none pointer-events-none"
              fontSize={13}
            >
              {val}
            </text>
          );
        })}

        {/* Hand */}
        <line
          x1={CX}
          y1={CY}
          x2={handX}
          y2={handY}
          stroke="#3b82f6"
          strokeWidth={2}
        />
        <circle cx={handX} cy={handY} r={10} fill="#2563eb" />
        <circle cx={CX} cy={CY} r={4} fill="#3b82f6" />

        {/* Center display — pointer events bubble up to SVG for swipe/drag handling.
            type="button" on every button is critical: without it, buttons inside a
            <form> default to type="submit", triggering HTML5 validation which
            focuses the required title input. */}
        <foreignObject
          x={CX - 52}
          y={CY - 40}
          width={104}
          height={80}
          data-testid="dial-center"
        >
          <div className="flex flex-col items-center gap-1 select-none">
            <div className="flex items-center gap-1">
              <button
                type="button"
                data-testid="dial-hour"
                onClick={() => onPhaseSelect("hour")}
                className={`text-xl font-bold ${phase === "hour" ? "text-blue-400" : "text-slate-300"}`}
              >
                {hourDisplay}
              </button>
              <span className="text-slate-300 text-xl">:</span>
              <button
                type="button"
                data-testid="dial-minute"
                onClick={() => onPhaseSelect("minute")}
                className={`text-xl font-bold ${phase === "minute" ? "text-blue-400" : "text-slate-300"}`}
              >
                {minuteDisplay}
              </button>
            </div>
            <button
              type="button"
              data-testid="ampm-icon"
              onClick={() => onToggleAmPm()}
              className="text-base"
            >
              {isPm ? "🌙" : "☀️"}
            </button>
            <div className="flex gap-1">
              <div
                className={`w-1.5 h-1.5 rounded-full ${!isPm ? "bg-blue-400" : "bg-slate-500"}`}
              />
              <div
                className={`w-1.5 h-1.5 rounded-full ${isPm ? "bg-blue-400" : "bg-slate-500"}`}
              />
            </div>
          </div>
        </foreignObject>
      </svg>
    </div>
  );
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
  if (prevValue.current !== value) {
    prevValue.current = value;
    const updated = to12h(value);
    setDialHour(updated.hour);
    setDialMinute(updated.minute);
    setDialIsPm(updated.isPm);
    setPhase("hour");
  }

  function handleHourConfirm(h: number): void {
    setDialHour(h);
    setPhase("minute");
  }

  function handleMinuteConfirm(m: number): void {
    const { hour: h24, minute: min } = to24h(dialHour, m, dialIsPm);
    setDialMinute(m);
    setPhase("hour");
    emitDate(fields.year, fields.month, fields.day, h24, min);
  }

  function handleToggleAmPm(): void {
    setDialIsPm((prev) => !prev);
  }

  const nativeDateValue = `${String(value.getFullYear()).padStart(4, "0")}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

  return (
    <div className="flex flex-col gap-4">
      {/* Day slider */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-200">
            {dayLabel(value, today)}
          </span>
          <button
            type="button"
            aria-label="Open calendar"
            className="ml-auto text-slate-400 hover:text-slate-200"
            onClick={(e) => {
              (
                e.currentTarget.nextElementSibling as HTMLInputElement | null
              )?.showPicker?.();
            }}
          >
            📅
          </button>
          <input
            type="date"
            className="sr-only"
            value={nativeDateValue}
            onChange={handleNativeDateChange}
          />
        </div>
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

      {/* Clock dial */}
      <ClockDial
        value={value}
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
