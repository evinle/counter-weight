import { ScreenTitle } from './ScreenTitle'

export function AnalyticsView() {
  return (
    <div className="flex flex-col pb-tab-bar">
      <ScreenTitle title="Analytics" />
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <span className="text-5xl mb-3">📊</span>
        <p className="text-sm">Analytics coming soon.</p>
      </div>
    </div>
  )
}
