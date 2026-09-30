import type { SyncTrigger } from "../lib/syncTrigger";
import { RefreshIcon } from "./CardIcons";

interface Props {
  onRefresh: (() => Promise<void>) | null;
  syncTrigger: SyncTrigger | null;
}

export function RefreshButton({ onRefresh, syncTrigger }: Props) {
  if (!onRefresh) return null;
  const syncing = syncTrigger !== null;

  return (
    <button
      aria-label="Refresh"
      disabled={syncing}
      onClick={() => void onRefresh()}
      className="ml-auto w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors cursor-pointer disabled:cursor-default"
    >
      <span className={syncing ? "animate-spin" : undefined}>
        <RefreshIcon size={20} />
      </span>
    </button>
  );
}
