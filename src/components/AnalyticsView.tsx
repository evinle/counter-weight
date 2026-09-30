import { AnalyticsIcon } from "../icons/AnalyticsIcon";
import { ScreenTitle } from './ScreenTitle'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import { PullToRefreshIndicator } from './PullToRefreshIndicator'
import type { SyncTrigger } from '../lib/syncTrigger'

interface Props {
  onRefresh: (() => Promise<void>) | null
  syncTrigger: SyncTrigger | null
}

export function AnalyticsView({ onRefresh, syncTrigger }: Props) {
  const { containerRef: pullRef } = usePullToRefresh({ onRefresh })

  return (
    <div ref={pullRef} className="flex flex-col h-full overflow-auto pb-tab-bar">
      <ScreenTitle title="Analytics" onRefresh={onRefresh} syncTrigger={syncTrigger} />
      <PullToRefreshIndicator syncTrigger={syncTrigger} />
      <div className="flex flex-col items-center justify-center py-20 text-ink-faint">
        <AnalyticsIcon className="icon-xl mb-3" />
        <p className="text-sm">Analytics coming soon.</p>
      </div>
    </div>
  )
}
