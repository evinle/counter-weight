import { useState } from 'react'
import { useGroups } from '../hooks/useGroups'
import { useViewStore } from '../store/viewStore'
import type { Group } from '../db/schema'

interface Props {
  userId: string | null
  onManageGroups: () => void
}

export function GroupSearchPanel({ userId, onManageGroups }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const groups = useGroups(userId)
  const selectedGroupId = useViewStore((s) => s.selectedGroupId)
  const setSelectedGroup = useViewStore((s) => s.setSelectedGroup)
  const clearSelectedGroup = useViewStore((s) => s.clearSelectedGroup)

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null

  const filtered = query.trim()
    ? groups.filter((g) => g.name.toLowerCase().includes(query.toLowerCase()))
    : groups

  function handleSelect(group: Group) {
    if (group.id === undefined) return
    setSelectedGroup(group.id)
    setOpen(false)
    setQuery('')
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          aria-label="Filter by group"
          onClick={() => setOpen((o) => !o)}
          className="text-slate-400 hover:text-slate-200 transition-colors p-1"
        >
          ⚙
        </button>
        {selectedGroup && (
          <div className="flex items-center gap-1 bg-blue-600/20 border border-blue-500/40 rounded-full px-3 py-0.5 text-sm text-blue-300">
            {selectedGroup.emoji && <span>{selectedGroup.emoji}</span>}
            <span>{selectedGroup.name}</span>
            <button
              aria-label="Clear filter"
              onClick={clearSelectedGroup}
              className="ml-1 text-blue-400 hover:text-blue-200"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {open && (
        <div className="mt-2 flex flex-col gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search groups…"
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500"
          />
          <ul className="flex flex-col gap-1">
            {filtered.map((group) => (
              <li key={group.id}>
                <button
                  onClick={() => handleSelect(group)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    group.id === selectedGroupId
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  {group.emoji && <span className="mr-2">{group.emoji}</span>}
                  {group.name}
                </button>
              </li>
            ))}
          </ul>
          <button
            onClick={() => { setOpen(false); onManageGroups(); }}
            className="text-xs text-slate-400 hover:text-slate-200 text-left py-1"
          >
            Manage groups →
          </button>
        </div>
      )}
    </div>
  )
}
