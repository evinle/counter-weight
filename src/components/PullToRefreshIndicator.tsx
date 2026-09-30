import { usePullDistance } from "../contexts/PullToRefreshContext";
import { useMinimumVisible } from "../hooks/useMinimumVisible";
import { MIN_REFRESH_INDICATOR_MS } from "../lib/gestures";

interface Props {
  syncing: boolean;
}

export function PullToRefreshIndicator({ syncing }: Props) {
  const { pullDistance } = usePullDistance();
  const refreshing = useMinimumVisible(syncing, MIN_REFRESH_INDICATOR_MS);
  if (pullDistance === 0 && !refreshing) return null;

  return (
    <div
      role={refreshing ? "status" : undefined}
      aria-label={refreshing ? "Refreshing" : undefined}
      className="flex items-center justify-center overflow-hidden shrink-0"
      style={{
        height: refreshing && pullDistance === 0 ? 32 : pullDistance,
        transition: pullDistance === 0 ? "height 0.15s ease-out" : "none",
      }}
    >
      <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center shadow-lg">
        {refreshing ? (
          <div className="w-5 h-5 border-2 border-slate-500 border-t-slate-200 rounded-full animate-spin" />
        ) : (
          <span className="text-slate-300 text-sm leading-none">↓</span>
        )}
      </div>
    </div>
  );
}
