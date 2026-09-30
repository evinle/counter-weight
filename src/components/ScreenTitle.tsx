import type { SyncTrigger } from '../lib/syncTrigger'
import { RefreshButton } from './RefreshButton'

interface Props {
  title: string
  onRefresh?: (() => Promise<void>) | null
  syncTrigger?: SyncTrigger | null
}

export function ScreenTitle({ title, onRefresh = null, syncTrigger = null }: Props) {
  return (
    <div className="flex items-center gap-2 px-4 pt-4 pb-2">
      <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
      <RefreshButton onRefresh={onRefresh} syncTrigger={syncTrigger} />
    </div>
  )
}
