import { useState, useEffect, useRef } from 'react'
import { useUserTags, createTag, deleteTag, renameTag } from '../hooks/useTags'
import { SyncStatuses } from '../db/schema'
import { db } from '../db'
import { trpc } from '../lib/trpc'

const PRESET_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#6b7280',
]

const LONG_PRESS_MS = 500

interface Props {
  userId: string | null
  initialServerIds?: string[]
  onChange: (serverIds: string[]) => void
  longPressMs?: number
}

export function TagPicker({ userId, initialServerIds = [], onChange, longPressMs = LONG_PRESS_MS }: Props) {
  const userTags = useUserTags(userId)

  const [selectedDexieIds, setSelectedDexieIds] = useState<Set<number>>(new Set())
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current || userTags.length === 0 || initialServerIds.length === 0) return
    initialized.current = true
    setSelectedDexieIds(
      new Set(
        userTags
          .filter((t) => t.id !== undefined && t.serverId && initialServerIds.includes(t.serverId))
          .map((t) => t.id!),
      ),
    )
  }, [userTags]) // eslint-disable-line react-hooks/exhaustive-deps

  const [popoverTagId, setPopoverTagId] = useState<number | null>(null)
  const [renamingTagId, setRenamingTagId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[4])
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)

  function computeServerIds(ids: Set<number>, extraServerId?: string): string[] {
    const fromExisting = userTags
      .filter((t) => t.id !== undefined && ids.has(t.id!) && t.serverId)
      .map((t) => t.serverId!)
    return extraServerId ? [...fromExisting, extraServerId] : fromExisting
  }

  function toggleTag(dexieId: number) {
    const next = new Set(selectedDexieIds)
    if (next.has(dexieId)) {
      next.delete(dexieId)
    } else {
      next.add(dexieId)
    }
    setSelectedDexieIds(next)
    onChange(computeServerIds(next))
  }

  function startLongPress(dexieId: number) {
    longPressTimer.current = setTimeout(() => {
      setPopoverTagId(dexieId)
    }, longPressMs)
  }

  function cancelLongPress() {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  function openRename(dexieId: number, currentName: string) {
    setPopoverTagId(null)
    setRenamingTagId(dexieId)
    setRenameValue(currentName)
  }

  async function commitRename(dexieId: number) {
    const tag = userTags.find((t) => t.id === dexieId)
    if (tag && renameValue.trim()) {
      await renameTag(tag, renameValue.trim())
    }
    setRenamingTagId(null)
    setRenameValue('')
  }

  async function handleCreate() {
    const name = newTagName.trim()
    if (!name) return
    setCreating(true)
    try {
      const dexieId = await createTag({ name, color: newTagColor, emoji: null }, userId)

      // Try to sync immediately so the timer can reference this tag's serverId right away.
      // On failure (offline / unauthenticated) the tag stays pending and won't appear in tagIds
      // until the next sync cycle drains tags before timers.
      let syncedServerId: string | undefined
      if (userId) {
        try {
          const result = await trpc.tags.upsert.mutate({
            serverId: null,
            name,
            color: newTagColor,
            emoji: null,
          })
          await db.tags.update(dexieId, {
            serverId: result.serverId,
            version: result.version,
            syncStatus: SyncStatuses.Synced,
          })
          syncedServerId = result.serverId
        } catch {
          // stays pending; drain cycle will pick it up later
        }
      }

      const next = new Set(selectedDexieIds)
      next.add(dexieId)
      setSelectedDexieIds(next)
      onChange(computeServerIds(next, syncedServerId))

      setNewTagName('')
      setShowCreate(false)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-col gap-2" onClick={() => setPopoverTagId(null)}>
      <div className="flex flex-wrap gap-2 min-h-[32px]">
        {userTags.map((tag) => {
          const dexieId = tag.id
          if (dexieId === undefined) return null
          const selected = selectedDexieIds.has(dexieId)

          if (renamingTagId === dexieId) {
            return (
              <input
                key={dexieId}
                autoFocus
                className="px-3 py-1 rounded-full text-sm font-medium bg-slate-600 text-white outline-none focus:ring-2 focus:ring-white w-28"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => commitRename(dexieId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); void commitRename(dexieId) }
                  if (e.key === 'Escape') { setRenamingTagId(null); setRenameValue('') }
                }}
              />
            )
          }

          return (
            <div key={dexieId} className="relative">
              <button
                type="button"
                className={`px-3 py-1 rounded-full text-sm font-medium transition-all cursor-pointer select-none ${
                  selected ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-800' : 'opacity-60 hover:opacity-90'
                }`}
                style={{ backgroundColor: tag.color ?? '#6b7280', color: '#fff' }}
                onClick={(e) => { e.stopPropagation(); toggleTag(dexieId) }}
                onPointerDown={(e) => { e.stopPropagation(); startLongPress(dexieId) }}
                onPointerUp={cancelLongPress}
                onPointerCancel={cancelLongPress}
                onPointerLeave={cancelLongPress}
                onContextMenu={(e) => { e.preventDefault(); setPopoverTagId(dexieId) }}
              >
                {tag.name}
                {!tag.serverId && <span className="ml-1 opacity-70 text-xs">↻</span>}
              </button>

              {popoverTagId === dexieId && (
                <div
                  className="absolute bottom-full left-0 mb-1 z-10 flex flex-col rounded-lg bg-slate-700 shadow-lg overflow-hidden text-sm"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="px-4 py-2 text-left hover:bg-slate-600 text-white cursor-pointer whitespace-nowrap"
                    onClick={() => openRename(dexieId, tag.name)}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 text-left hover:bg-red-700 text-red-400 cursor-pointer whitespace-nowrap"
                    onClick={() => { setPopoverTagId(null); void deleteTag(tag) }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          )
        })}
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="px-3 py-1 rounded-full text-sm font-medium bg-slate-600 text-slate-300 hover:bg-slate-500 transition-colors cursor-pointer"
        >
          + New
        </button>
      </div>

      {showCreate && (
        <div className="flex flex-col gap-2 p-3 bg-slate-700 rounded-lg">
          <input
            autoFocus
            className="rounded p-2 bg-slate-600 text-white text-sm placeholder:text-slate-400 outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Tag name"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void handleCreate()
              }
            }}
          />
          <div className="flex gap-2 flex-wrap">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setNewTagColor(c)}
                className={`w-6 h-6 rounded-full transition-all cursor-pointer ${
                  newTagColor === c ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-700' : ''
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={!newTagName.trim() || creating}
              className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50 hover:bg-blue-500 transition-colors cursor-pointer"
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false)
                setNewTagName('')
              }}
              className="px-4 py-2 rounded-lg bg-slate-600 text-slate-300 text-sm cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
