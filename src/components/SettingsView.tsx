import { ScreenTitle } from './ScreenTitle'

export function SettingsView() {
  return (
    <div className="flex flex-col pb-tab-bar">
      <ScreenTitle title="Settings" />
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <span className="text-5xl mb-3">⚙️</span>
        <p className="text-sm">Settings coming soon.</p>
      </div>
    </div>
  )
}
