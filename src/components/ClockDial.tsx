import { useState, useRef, useCallback, useEffect } from "react";
import { angleToHour, angleToMinute, pointToAngle } from "./clockMath";

export type DialPhase = "hour" | "minute";

const HOUR_LABELS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTE_LABELS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function labelAngle(index: number): number {
  return (index / 12) * 360;
}

export interface DialProps {
  mode: "time-of-day" | "interval";
  phase: DialPhase;
  selectedHour: number; // 1–12
  selectedMinute: number; // 0–59
  isPm: boolean;
  onHourConfirm: (hour: number) => void;
  onMinuteConfirm: (minute: number) => void;
  onPhaseSelect: (phase: DialPhase) => void;
  onToggleAmPm: () => void;
}

export function ClockDial({
  mode,
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
    if (isInCenter(e)) {
      swipeStartX.current = e.clientX;
    } else {
      e.currentTarget.setPointerCapture?.(e.pointerId);
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

  // In interval mode, the center shows the 0–23 computed value instead of face value (1–12).
  const hourDisplay =
    mode === "interval"
      ? isPm
        ? selectedHour === 12
          ? 12
          : selectedHour + 12
        : selectedHour === 12
          ? 0
          : selectedHour
      : selectedHour;

  const minuteDisplay = String(selectedMinute).padStart(2, "0");

  // In interval mode, the toggle shows text labels instead of emoji.
  const toggleLabel =
    mode === "interval"
      ? isPm
        ? "12–23"
        : "0–11"
      : isPm
        ? "🌙"
        : "☀️";

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
              {toggleLabel}
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
