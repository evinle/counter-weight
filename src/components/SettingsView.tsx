import { useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { exportTimers, importTimers } from '../lib/backup'
import { bulkImportTimers } from '../hooks/useTimers'
import { useToast } from '../hooks/useToast'
import { ScreenTitle } from './ScreenTitle'

export function SettingsView() {
  const { show } = useToast()
  const allTimers = useLiveQuery(() => db.timers.toArray(), [], [])
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleExport() {
    const json = exportTimers(allTimers ?? [])
    const date = new Date().toISOString().slice(0, 10)
    const filename = `counter-weight-${date}.json`
    const file = new File([json], filename, { type: 'application/json' })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] })
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          show({ message: 'Export failed', variant: 'error', ttl: 0 })
        }
      }
      return
    }
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const { timers, skipped } = importTimers(text)
      await bulkImportTimers(timers)
      const msg =
        skipped > 0
          ? `Imported ${timers.length} timers, ${skipped} could not be read`
          : `Imported ${timers.length} timers`
      show({ message: msg, variant: skipped > 0 ? 'default' : 'success' })
    } catch (err) {
      show({
        message: `Import failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        variant: 'error',
        ttl: 0,
      })
    }
    e.target.value = ''
  }

  return (
    <div className="flex flex-col pb-tab-bar">
      <ScreenTitle title="Settings" />
      <div className="flex flex-col gap-3 p-4">
        <button
          onClick={handleExport}
          className="flex items-center gap-3 bg-slate-800 rounded-xl p-4 active:opacity-70 transition-opacity cursor-pointer w-full text-left"
        >
          <span className="text-2xl">📤</span>
          <span className="text-white font-medium">Export Timers</span>
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-3 bg-slate-800 rounded-xl p-4 active:opacity-70 transition-opacity cursor-pointer w-full text-left"
        >
          <span className="text-2xl">📥</span>
          <span className="text-white font-medium">Import Timers</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleImport}
        />
      </div>
    </div>
  )
}
