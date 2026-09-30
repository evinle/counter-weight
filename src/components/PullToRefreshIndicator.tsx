import { ArrowDownIcon } from "../icons/ArrowDownIcon";
import { usePullDistance } from "../contexts/PullToRefreshContext";
import { SyncTrigger } from "../lib/syncTrigger";

interface Props {
  syncTrigger: SyncTrigger | null;
  className?: string;
}

export function PullToRefreshIndicator({ syncTrigger, className = "" }: Props) {
  const { pullDistance } = usePullDistance();
  const syncing = syncTrigger === SyncTrigger.Manual;
  if (pullDistance === 0 && !syncing) return null;

  return (
    <div
      role={syncing ? "status" : undefined}
      aria-label={syncing ? "Refreshing" : undefined}
      className={`flex items-center justify-center overflow-hidden shrink-0 ${className}`}
      style={{
        height: syncing && pullDistance === 0 ? 32 : pullDistance,
        transition: pullDistance === 0 ? "height 0.15s ease-out" : "none",
      }}
    >
      <div className="w-8 h-8 bg-surface-raised rounded-full flex items-center justify-center shadow-lg">
        {syncing ? (
          <div className="w-5 h-5 border-2 border-line-strong border-t-ink rounded-full animate-spin" />
        ) : (
          <ArrowDownIcon className="icon-sm text-ink-muted" />
        )}
      </div>
    </div>
  );
}
