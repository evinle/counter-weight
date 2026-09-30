import { useEffect, useRef } from "react";
import type { ComponentType } from "react";
import type { IconProps } from "../icons/Icon";
import { ArrowDownIcon } from "../icons/ArrowDownIcon";
import { ArrowUpIcon } from "../icons/ArrowUpIcon";
import { CalendarIcon } from "../icons/CalendarIcon";
import { ChevronLeftIcon } from "../icons/ChevronLeftIcon";
import { ChevronRightIcon } from "../icons/ChevronRightIcon";
import { ClockIcon } from "../icons/ClockIcon";
import { FlameIcon } from "../icons/FlameIcon";
import { HourglassIcon } from "../icons/HourglassIcon";
import { TypeIcon } from "../icons/TypeIcon";
import { ZapIcon } from "../icons/ZapIcon";
import { useScrollEdges } from "../hooks/useScrollEdges";
import { useFilteredFeed } from "../hooks/useFilteredFeed";
import { useTagsMap } from "../hooks/useTags";
import { useLingeringTimers } from "../hooks/useLingeringTimers";
import { useSortMode } from "../hooks/useSortMode";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { RefreshButton } from "./RefreshButton";
import { TimerCard } from "./TimerCard";
import { GroupSearchPanel } from "./GroupSearchPanel";
import { PullToRefreshIndicator } from "./PullToRefreshIndicator";
import type { SyncTrigger } from "../lib/syncTrigger";
import { SortModes, SortDirections } from "../lib/sort";
import type { SortMode } from "../lib/sort";
import type { Timer } from "../db/schema";

interface Props {
  onEdit: (timer: Timer) => void;
  onManageGroups: () => void;
  userId: string | null;
  onRefresh: (() => Promise<void>) | null;
  syncTrigger: SyncTrigger | null;
}

const SORT_MODES: Record<SortMode, { label: string; icon: ComponentType<IconProps> }> = {
  smart: { label: "Smart", icon: ZapIcon },
  targetDatetime: { label: "Date", icon: CalendarIcon },
  createdAt: { label: "Created", icon: ClockIcon },
  priority: { label: "Priority", icon: FlameIcon },
  title: { label: "Title", icon: TypeIcon },
};

const ALL_SORT_MODES = Object.values(SortModes) as SortMode[];

export function FeedView({
  onEdit,
  onManageGroups,
  userId,
  onRefresh,
  syncTrigger,
}: Props) {
  const { mode, setMode, direction, setDirection } = useSortMode();
  const { timers, hold } = useLingeringTimers(useFilteredFeed(mode, direction));
  const tagsMap = useTagsMap();
  const activePillRef = useRef<HTMLButtonElement>(null);
  const { scrollRef, showLeft, showRight } = useScrollEdges();
  const { containerRef: pullRef } = usePullToRefresh({ onRefresh });

  useEffect(() => {
    activePillRef.current?.scrollIntoView({
      behavior: "instant",
      block: "nearest",
      inline: "start",
    });
  }, [mode]);

  const toggleDirection = () =>
    setDirection(
      direction === SortDirections.Asc
        ? SortDirections.Desc
        : SortDirections.Asc,
    );

  const renderTimersContent = () =>
    timers.length === 0 ? (
      <div className="flex flex-col items-center justify-center h-full text-ink-faint">
        <HourglassIcon className="icon-xl mb-3" />
        <p className="text-sm">No active timers. Create one to get started.</p>
      </div>
    ) : (
      <div className="flex flex-col gap-3 p-4 box-border">
        {timers.map((timer) => (
          <TimerCard
            key={timer.id}
            timer={timer}
            tagsMap={tagsMap}
            onEdit={onEdit}
            onDepart={hold}
          />
        ))}
      </div>
    );

  return (
    <div ref={pullRef} className="flex flex-col h-full overflow-auto">
      <div className="relative z-40 flex items-center gap-2 px-4 pt-4 pb-2">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Timers</h1>
        <GroupSearchPanel userId={userId} onManageGroups={onManageGroups} />
        <RefreshButton onRefresh={onRefresh} syncTrigger={syncTrigger} />
      </div>

      <div className="sticky top-0 z-30 flex items-stretch gap-2 px-4 bg-canvas border-b border-line">
        <button
          onClick={toggleDirection}
          className="flex-shrink-0 self-center w-8 h-8 flex items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-surface-raised transition-colors"
          aria-label={
            direction === SortDirections.Asc ? "Ascending" : "Descending"
          }
        >
          {direction === SortDirections.Asc ? (
            <ArrowUpIcon className="icon-md" />
          ) : (
            <ArrowDownIcon className="icon-md" />
          )}
        </button>

        <div className="flex items-stretch gap-1 flex-1 min-w-0">
          {showLeft && (
            <ChevronLeftIcon className="icon-md flex-shrink-0 self-center text-ink-faint" />
          )}
          <div
            ref={scrollRef}
            className="flex items-center gap-2 py-2 overflow-x-auto scrollbar-none snap-x snap-mandatory flex-1 min-w-0"
          >
            {ALL_SORT_MODES.map((m) => {
              const { label, icon: SortIcon } = SORT_MODES[m];
              return (
              <button
                key={m}
                ref={mode === m ? activePillRef : null}
                onClick={() => setMode(m)}
                className={`flex-shrink-0 snap-start flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  mode === m
                    ? "bg-surface-strong text-ink"
                    : "text-ink-muted hover:text-ink hover:bg-surface-raised"
                }`}
              >
                <SortIcon className="icon-sm" />
                {label}
              </button>
              );
            })}
          </div>
          {showRight && (
            <ChevronRightIcon className="icon-md flex-shrink-0 self-center text-ink-faint" />
          )}
        </div>
      </div>

      <PullToRefreshIndicator syncTrigger={syncTrigger} className="mt-5" />

      {renderTimersContent()}
    </div>
  );
}
