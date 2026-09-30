import { HistoryIcon } from "../icons/HistoryIcon";
import { useHistoryTimers } from "../hooks/useTimers";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { ScreenTitle } from "./ScreenTitle";
import { PullToRefreshIndicator } from "./PullToRefreshIndicator";
import type { SyncTrigger } from "../lib/syncTrigger";
import { getHistoryAnnotation, HistoryTiming } from "../lib/countdown";
import { isHistoryStatus, type HistoryStatus } from "../db/schema";

interface Props {
  onRefresh: (() => Promise<void>) | null;
  syncTrigger: SyncTrigger | null;
}

const STATUS_LABELS: Record<HistoryStatus, string> = {
  completed: "Completed",
  missed: "Missed",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<HistoryStatus, string> = {
  completed: "text-success",
  missed: "text-danger",
  cancelled: "text-ink-muted",
};

const TIMING_COLORS: Record<HistoryTiming, string> = {
  "on-time": "text-ink-muted",
  early: "text-success",
  overdue: "text-danger",
};

function formatAnnotation(text: string, timing: HistoryTiming): string {
  switch (timing) {
    case HistoryTiming.Early:
      return `${text} remaining`;
    case HistoryTiming.OnTime:
      return "On time";
    case HistoryTiming.Overdue:
      return `${text} overdue`;
  }
}

export function HistoryView({ onRefresh, syncTrigger }: Props) {
  const timers = useHistoryTimers();
  const { containerRef: pullRef } = usePullToRefresh({ onRefresh });

  const renderTimersHistoryContent = () =>
    timers.length === 0 ? (
      <div className="flex flex-col items-center justify-center h-full text-ink-faint">
        <HistoryIcon className="icon-xl mb-3" />
        <p className="text-sm">No completed timers yet.</p>
      </div>
    ) : (
      <div className="flex flex-col gap-3 p-4 box-border">
        {timers.map((timer) => {
          const { text, timing, extensionText } = getHistoryAnnotation(
            timer.targetDatetime,
            timer.updatedAt,
            timer.originalTargetDatetime,
            timer.createdAt,
          );
          const status = timer.status;
          if (!isHistoryStatus(status))
            return (
              <div
                key={timer.id}
                className="bg-surface rounded-xl p-4 flex flex-col gap-1"
              >
                <div className="flex items-center gap-2">
                  <span className="text-danger">
                    Invalid timer data: {status}
                  </span>
                </div>
              </div>
            );

          return (
            <div
              key={timer.id}
              className="bg-surface rounded-xl p-4 flex flex-col gap-1"
            >
              <div className="flex items-center gap-2">
                {timer.emoji && <span>{timer.emoji}</span>}
                <span className="font-semibold text-ink flex-1 truncate">
                  {timer.title}
                </span>
                <span
                  className={`text-xs font-medium shrink-0 ${STATUS_COLORS[status]}`}
                >
                  {STATUS_LABELS[status]}
                </span>
              </div>

              <p className={`text-xs ${TIMING_COLORS[timing]}`}>
                {formatAnnotation(text, timing)}
                {extensionText && (
                  <p className="text-xs text-ink-faint inline">
                    {" "}
                    {extensionText}
                  </p>
                )}
              </p>
            </div>
          );
        })}
      </div>
    );

  return (
    <div ref={pullRef} className="flex flex-col h-full overflow-auto">
      <ScreenTitle title="History" onRefresh={onRefresh} syncTrigger={syncTrigger} />
      <PullToRefreshIndicator syncTrigger={syncTrigger} />
      {renderTimersHistoryContent()}
    </div>
  );
}
