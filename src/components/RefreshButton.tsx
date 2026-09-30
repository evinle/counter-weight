import type { SyncTrigger } from "../lib/syncTrigger";
import { RefreshIcon } from "../icons/RefreshIcon";

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
      className="ml-auto w-9 h-9 flex items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-surface-raised disabled:hover:bg-transparent disabled:hover:text-ink-muted transition-colors cursor-pointer disabled:cursor-default"
    >
      <span className={syncing ? "animate-spin" : undefined}>
        <RefreshIcon className="icon-md" />
      </span>
    </button>
  );
}
