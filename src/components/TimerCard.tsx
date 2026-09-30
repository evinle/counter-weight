import { useEffect, useRef, useState } from "react";
import { useAnimatedCountdown } from "../hooks/useAnimatedCountdown";
import { useAnimatedElapsed } from "../hooks/useAnimatedElapsed";
import { useSwipeToComplete } from "../hooks/useSwipeToComplete";
import { formatDuration } from "../lib/countdown";
import { DROP_REVEAL_WIDTH } from "../lib/gestures";
import { CheckIcon } from "../icons/CheckIcon";
import { KebabIcon } from "../icons/KebabIcon";
import { PauseIcon } from "../icons/PauseIcon";
import { PencilIcon } from "../icons/PencilIcon";
import { PlayIcon } from "../icons/PlayIcon";
import { TrashIcon } from "../icons/TrashIcon";
import {
  completeTimer,
  cancelTimer,
  startWork,
  endWork,
  doneTask,
} from "../hooks/useTimers";
import { TimerType } from "../db/schema";
import type { Timer, Priority, Tag } from "../db/schema";

const PRIORITY_COLOURS: Record<Priority, string> = {
  low: "text-slate-400",
  medium: "text-blue-400",
  high: "text-amber-400",
  critical: "text-red-500",
};

interface Props {
  timer: Timer;
  tagsMap: Map<string, Tag>;
  onEdit: (timer: Timer) => void;
  onDepart?: (timer: Timer) => void;
}

export function TimerCard({ timer, tagsMap, onEdit, onDepart }: Props) {
  const [dropped, setDropped] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [side, setSide] = useState<"complete" | "drop" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const remaining = useAnimatedCountdown(timer.targetDatetime);
  const isOverdue = remaining <= 0;
  const countdownText = formatDuration(remaining);
  const elapsed = useAnimatedElapsed(timer.workSessions);
  const isTask = timer.timerType === TimerType.Task;
  const hasOpenSession = timer.workSessions.some((s) => s.endedAt === null);
  const {
    containerRef: swipeRef,
    dragX,
    armed,
    completed,
    complete,
  } = useSwipeToComplete({
    onComplete: () => {
      onDepart?.(timer);
      if (timer.id === undefined) return;
      if (isTask) doneTask(timer.id);
      else completeTimer(timer.id);
    },
  });

  const direction =
    completed || dragX > 0 ? "complete" : dropped || armed || dragX < 0 ? "drop" : null;
  if (direction !== null && direction !== side) setSide(direction);

  useEffect(() => {
    if (!menuOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    function onPointerDown(e: PointerEvent) {
      const inside = e.target instanceof Node && menuRef.current?.contains(e.target);
      if (!inside) setMenuOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [menuOpen]);

  function drop() {
    setMenuOpen(false);
    setDropped(true);
    onDepart?.(timer);
    if (timer.id !== undefined) cancelTimer(timer.id);
  }

  const resolvedTags = timer.tagIds.flatMap((id) => {
    const tag = tagsMap.get(id);
    return tag ? [tag] : [];
  });

  const menuItemClass =
    "w-full flex items-center gap-3 text-left px-3 py-2 rounded-lg text-sm text-white hover:bg-slate-600 cursor-pointer";

  return (
    <div className="relative rounded-xl overflow-hidden">
      {side === "complete" && (
        <div
          data-testid="complete-panel"
          className="absolute inset-0 bg-emerald-900/70 flex items-center pl-6 text-emerald-200 font-medium"
          aria-hidden="true"
        >
          {completed ? (
            <span
              data-testid="complete-confirmation"
              className="w-full text-center text-7xl text-emerald-200"
            >
              <CheckIcon className="icon-xl mx-auto" />
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <CheckIcon className="icon-md" />
              Done
            </span>
          )}
        </div>
      )}
      {side === "drop" && dropped && (
        <div className="absolute inset-0 bg-rose-900/70 flex items-center justify-center">
          <span data-testid="drop-confirmation">
            <TrashIcon className="icon-xl" />
          </span>
        </div>
      )}
      {side === "drop" && !dropped && (
        <button
          data-testid="drop-panel"
          disabled={!armed}
          onClick={drop}
          className="absolute inset-0 bg-rose-900/70 flex items-center justify-end text-rose-200 font-medium cursor-pointer disabled:cursor-default"
        >
          <span className="flex items-center justify-center gap-1.5" style={{ width: DROP_REVEAL_WIDTH }}>
            Drop
            <TrashIcon className="icon-md" />
          </span>
        </button>
      )}
      <div
        ref={swipeRef}
        data-testid="timer-card"
        onTransitionEnd={(e) => {
          const settled = e.target === e.currentTarget && e.propertyName === "transform";
          if (settled && dragX === 0 && !armed && !dropped && !completed) setSide(null);
        }}
        className="relative rounded-xl p-5 min-h-44 bg-slate-800 flex flex-col gap-3 touch-pan-y select-none"
        style={{
          transform: dropped
            ? "translateX(-100%)"
            : completed
            ? "translateX(100%)"
            : `translateX(${dragX !== 0 ? dragX : armed ? -DROP_REVEAL_WIDTH : 0}px)`,
          transition: dragX === 0 ? "transform 0.2s ease-out" : "none",
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-lg font-medium text-white truncate">
            {timer.emoji && <span className="mr-2">{timer.emoji}</span>}
            {timer.title}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {timer.recurrenceRule !== null && (
              <span
                data-testid="recurring-indicator"
                className="text-xs text-slate-400"
                title="Recurring"
              >
                ↻
              </span>
            )}
            <span
              className={`text-sm font-semibold uppercase ${PRIORITY_COLOURS[timer.priority]}`}
            >
              {timer.priority}
            </span>
            <div ref={menuRef} className="relative">
              <button
                aria-label="More actions"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
                className="w-8 h-8 -mr-2 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 cursor-pointer"
              >
                <KebabIcon className="icon-md" />
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-1 z-20 min-w-36 p-1 rounded-xl bg-slate-700 shadow-lg"
                >
                  {!isOverdue && (
                    <button
                      role="menuitem"
                      className={menuItemClass}
                      onClick={() => {
                        setMenuOpen(false);
                        onEdit(timer);
                      }}
                    >
                      <PencilIcon />
                      Edit
                    </button>
                  )}
                  <button
                    role="menuitem"
                    className={`${menuItemClass} text-rose-200`}
                    onClick={drop}
                  >
                    <TrashIcon />
                    Drop
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-center gap-2">
          <div className="flex items-center justify-between gap-3">
            <span
              className={`font-mono tabular-nums tracking-tight leading-none whitespace-nowrap ${
                /\d+d /.test(countdownText) ? "text-4xl" : "text-[2.5rem]"
              } ${isOverdue ? "text-red-400" : "text-white"}`}
            >
              {countdownText}
            </span>
            <button
              aria-label="Complete"
              onClick={complete}
              className="shrink-0 w-12 h-12 flex items-center justify-center rounded-xl bg-emerald-700 text-white hover:bg-emerald-600 active:scale-95 transition-all cursor-pointer"
            >
              <CheckIcon className="icon-lg" />
            </button>
          </div>

          {isTask && (
            <div data-testid="work-row" className="flex items-center gap-3 min-h-11">
              <span
                data-testid="work-elapsed"
                className={`text-lg font-mono tabular-nums tracking-tight ${
                  hasOpenSession ? "text-accent" : "text-ink-muted"
                }`}
              >
                {formatDuration(elapsed)}
              </span>
              <button
                aria-label={hasOpenSession ? "Pause work" : "Start work"}
                onClick={() => {
                  if (timer.id === undefined) return;
                  if (hasOpenSession) endWork(timer.id);
                  else startWork(timer.id);
                }}
                className={`w-11 h-11 -ml-2 flex items-center justify-center active:scale-90 transition-all cursor-pointer ${
                  hasOpenSession ? "text-amber-400 hover:text-amber-300" : "text-slate-400 hover:text-white"
                }`}
              >
                {hasOpenSession ? <PauseIcon className="icon-md" /> : <PlayIcon className="icon-md" />}
              </button>
            </div>
          )}

          <div data-testid="timer-tags" className="flex flex-wrap gap-1">
            {resolvedTags.map((tag) => (
              <span
                key={tag.serverId}
                className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: tag.color ?? "#6b7280" }}
              >
                {tag.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
