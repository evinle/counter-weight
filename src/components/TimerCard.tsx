import { useRef, useState, useEffect } from "react";
import { useAnimatedCountdown } from "../hooks/useAnimatedCountdown";
import { useAnimatedElapsed } from "../hooks/useAnimatedElapsed";
import { formatDuration } from "../lib/countdown";
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
}

export function TimerCard({ timer, tagsMap, onEdit }: Props) {
  const remaining = useAnimatedCountdown(timer.targetDatetime);
  const isOverdue = remaining <= 0;
  const elapsed = useAnimatedElapsed(timer.workSessions);
  const isTask = timer.timerType === TimerType.Task;
  const hasOpenSession = timer.workSessions.some((s) => s.endedAt === null);
  const hasSessions = timer.workSessions.length > 0;
  const [dropArmed, setDropArmed] = useState(false);
  const dropTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function armDrop() {
    setDropArmed(true);
    dropTimeoutRef.current = setTimeout(() => setDropArmed(false), 2000);
  }

  function confirmDrop() {
    if (dropTimeoutRef.current) clearTimeout(dropTimeoutRef.current);
    setDropArmed(false);
    if (timer.id !== undefined) cancelTimer(timer.id);
  }

  useEffect(() => {
    return () => {
      if (dropTimeoutRef.current) clearTimeout(dropTimeoutRef.current);
    };
  }, []);

  const resolvedTags = timer.tagIds.flatMap((id) => {
    const tag = tagsMap.get(id);
    return tag ? [tag] : [];
  });

  return (
    <div className="rounded-xl p-4 bg-slate-800 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-lg font-medium text-white truncate">
          {timer.emoji && <span className="mr-2">{timer.emoji}</span>}
          {timer.title}
        </span>
        <span
          className={`text-sm font-semibold uppercase shrink-0 ${PRIORITY_COLOURS[timer.priority]}`}
        >
          {timer.priority}
        </span>
      </div>

      <div className="flex items-baseline gap-4">
        <span
          className={`text-4xl font-mono tabular-nums tracking-tight ${isOverdue ? "text-red-400" : "text-white"}`}
        >
          {formatDuration(remaining)}
        </span>
        {isTask && hasSessions && (
          <span className="text-2xl font-mono tabular-nums tracking-tight text-emerald-400">
            {formatDuration(elapsed)}
          </span>
        )}
      </div>

      {resolvedTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
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
      )}

      <div className="flex items-center gap-3 mt-1">
        {isTask && !hasOpenSession && (
          <button
            onClick={() => {
              if (timer.id !== undefined) startWork(timer.id);
            }}
            className="w-12 py-3 rounded-xl bg-blue-700 text-white text-base font-medium min-h-[48px] hover:bg-blue-600 active:scale-95 transition-all cursor-pointer"
          >
            ▶
          </button>
        )}

        {isTask && hasOpenSession && (
          <button
            onClick={() => {
              if (timer.id !== undefined) endWork(timer.id);
            }}
            className="w-12 py-3 rounded-xl bg-amber-700 text-white text-base font-medium min-h-[48px] hover:bg-amber-600 active:scale-95 transition-all cursor-pointer"
          >
            ⏸
          </button>
        )}

        {(!isTask || hasSessions || hasOpenSession) && (
          <button
            onClick={() => {
              if (timer.id === undefined) return;
              if (isTask) doneTask(timer.id);
              else completeTimer(timer.id);
            }}
            className="flex-1 py-3 rounded-xl bg-green-700 text-white text-base font-medium min-h-[48px] hover:bg-green-600 active:scale-95 transition-all cursor-pointer"
          >
            Done
          </button>
        )}

        {!isOverdue && (
          <button
            onClick={() => onEdit(timer)}
            className="flex-1 py-3 rounded-xl bg-slate-600 text-white text-base font-medium min-h-[48px] hover:bg-slate-500 active:scale-95 transition-all cursor-pointer"
          >
            Edit
          </button>
        )}

        {dropArmed ? (
          <button
            onClick={confirmDrop}
            className="flex-1 py-3 rounded-xl bg-red-700 text-white text-base font-medium min-h-[48px] hover:bg-red-600 active:scale-95 transition-all cursor-pointer"
          >
            DROP?
          </button>
        ) : (
          <button
            onClick={armDrop}
            className="w-12 py-3 rounded-xl bg-slate-600 text-white text-base font-medium min-h-[48px] hover:bg-slate-500 active:scale-95 transition-all cursor-pointer"
          >
            🗑️
          </button>
        )}
      </div>
    </div>
  );
}
