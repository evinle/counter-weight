import { useFilteredFeed } from "../hooks/useFilteredFeed";
import { useTagsMap } from "../hooks/useTags";
import { TimerCard } from "./TimerCard";
import { GroupSearchPanel } from "./GroupSearchPanel";
import type { Timer } from "../db/schema";

interface Props {
  onEdit: (timer: Timer) => void;
  onManageGroups: () => void;
  userId: string | null;
}

export function FeedView({ onEdit, onManageGroups, userId }: Props) {
  const timers = useFilteredFeed();
  const tagsMap = useTagsMap();

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
      {renderTimersContent()}
    </div>
  );
}
