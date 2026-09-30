import { RefreshButton } from './RefreshButton'

interface Props {
  title: string
  onRefresh?: (() => Promise<void>) | null
  syncing?: boolean
}

export function ScreenTitle({ title, onRefresh = null, syncing = false }: Props) {
  return (
    <div className="flex items-center gap-2 px-4 pt-4 pb-2">
      <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
      <RefreshButton onRefresh={onRefresh} syncing={syncing} />
    </div>
  )
}
