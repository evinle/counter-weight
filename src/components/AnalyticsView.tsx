import { ScreenTitle } from './ScreenTitle'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import { PullToRefreshIndicator } from './PullToRefreshIndicator'

interface Props {
  onRefresh: (() => Promise<void>) | null
  syncing: boolean
}

export function AnalyticsView({ onRefresh, syncing }: Props) {
  const { containerRef: pullRef } = usePullToRefresh({ onRefresh })

  return (
    <div ref={pullRef} className="flex flex-col h-full overflow-auto pb-tab-bar">
      <ScreenTitle title="Analytics" />
      <PullToRefreshIndicator syncing={syncing} />
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <span className="text-5xl mb-3">📊</span>
        <p className="text-sm">Analytics coming soon.</p>
      </div>
    </div>
  )
}
