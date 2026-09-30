import { usePullDistance } from "../contexts/PullToRefreshContext";

interface Props {
  syncing: boolean;
  className?: string;
}

export function PullToRefreshIndicator({ syncing, className = "" }: Props) {
  const { pullDistance } = usePullDistance();
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
      <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center shadow-lg">
        {syncing ? (
          <div className="w-5 h-5 border-2 border-slate-500 border-t-slate-200 rounded-full animate-spin" />
        ) : (
          <span className="text-slate-300 text-sm leading-none">↓</span>
        )}
      </div>
    </div>
  );
}
