import { useEffect, useRef } from "react";
import { useScrollEdges } from "../hooks/useScrollEdges";
import { useFilteredFeed } from "../hooks/useFilteredFeed";
import { useTagsMap } from "../hooks/useTags";
import { useSortMode } from "../hooks/useSortMode";
import { TimerCard } from "./TimerCard";
import { GroupSearchPanel } from "./GroupSearchPanel";
import { SortModes, SortDirections } from "../lib/sort";
import type { SortMode } from "../lib/sort";
import type { Timer } from "../db/schema";

interface Props {
  onEdit: (timer: Timer) => void;
  onManageGroups: () => void;
  userId: string | null;
}

const SORT_MODE_LABELS: Record<SortMode, string> = {
  smart: "⚡ Smart",
  targetDatetime: "📅 Date",
  createdAt: "🕐 Created",
  priority: "🔥 Priority",
  title: "🔤 Title",
};

const ALL_SORT_MODES = Object.values(SortModes) as SortMode[];

export function FeedView({ onEdit, onManageGroups, userId }: Props) {
  const { mode, setMode, direction, setDirection } = useSortMode();
  const timers = useFilteredFeed(mode, direction);
  const tagsMap = useTagsMap();
  const activePillRef = useRef<HTMLButtonElement>(null);
  const { scrollRef, showLeft, showRight } = useScrollEdges();

  useEffect(() => {
    activePillRef.current?.scrollIntoView({ behavior: "instant", block: "nearest", inline: "start" });
  }, [mode]);

  const toggleDirection = () =>
    setDirection(direction === SortDirections.Asc ? SortDirections.Desc : SortDirections.Asc);

  const renderTimersContent = () =>
    timers.length === 0 ? (
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <span className="text-5xl mb-3">⏳</span>
        <p className="text-sm">No active timers. Create one to get started.</p>
      </div>
    ) : (
      <div className="flex flex-col gap-3 p-4 box-border">
        {timers.map((timer) => (
          <TimerCard key={timer.id} timer={timer} tagsMap={tagsMap} onEdit={onEdit} />
        ))}
      </div>
    );

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <h1 className="text-2xl font-bold tracking-tight text-white">Timers</h1>
        <GroupSearchPanel userId={userId} onManageGroups={onManageGroups} />
      </div>

      <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-2 bg-slate-900 border-b border-slate-800">
        <button
          onClick={toggleDirection}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          aria-label={direction === SortDirections.Asc ? "Ascending" : "Descending"}
        >
          {direction === SortDirections.Asc ? "↑" : "↓"}
        </button>

        <div className="flex items-center gap-1 flex-1 min-w-0">
          {showLeft && <span className="flex-shrink-0 text-slate-500 text-xl">‹</span>}
          <div ref={scrollRef} className="flex gap-2 overflow-x-auto scrollbar-none snap-x snap-mandatory flex-1 min-w-0">
            {ALL_SORT_MODES.map((m) => (
              <button
                key={m}
                ref={mode === m ? activePillRef : null}
                onClick={() => setMode(m)}
                className={`flex-shrink-0 snap-start px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  mode === m
                    ? "bg-slate-600 text-white"
                    : "text-slate-400 hover:text-white hover:bg-slate-700"
                }`}
              >
                {SORT_MODE_LABELS[m]}
              </button>
            ))}
          </div>
          {showRight && <span className="flex-shrink-0 text-slate-500 text-xl">›</span>}
        </div>
      </div>

      {renderTimersContent()}
    </div>
  );
}
