import { useState, useEffect, useRef } from 'react'
import { useUserTags, createTag } from '../hooks/useTags'
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

interface Props {
  userId: string | null
  initialServerIds?: string[]
  onChange: (serverIds: string[]) => void
}

export function TagPicker({ userId, initialServerIds = [], onChange }: Props) {
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
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2 min-h-[32px]">
        {userTags.map((tag) => {
          const selected = tag.id !== undefined && selectedDexieIds.has(tag.id)
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => tag.id !== undefined && toggleTag(tag.id)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-all cursor-pointer ${
                selected ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-800' : 'opacity-60 hover:opacity-90'
              }`}
              style={{ backgroundColor: tag.color ?? '#6b7280', color: '#fff' }}
            >
              {tag.name}
              {!tag.serverId && <span className="ml-1 opacity-70 text-xs">↻</span>}
            </button>
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
                handleCreate()
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
              onClick={handleCreate}
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
