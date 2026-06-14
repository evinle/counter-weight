import { useState } from 'react'
import { useGroups, deleteGroup } from '../hooks/useGroups'
import { ScreenTitle } from './ScreenTitle'
import type { Group } from '../db/schema'

interface Props {
  userId: string | null
  onEdit: (group: Group) => void
  onCreateNew: () => void
  onDone: () => void
}

export function GroupListView({ userId, onEdit, onCreateNew, onDone }: Props) {
  const groups = useGroups(userId)
  const [confirmingId, setConfirmingId] = useState<number | null>(null)

  async function handleConfirmDelete(group: Group) {
    await deleteGroup(group)
    setConfirmingId(null)
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="flex items-center justify-between pr-4">
        <ScreenTitle title="Groups" />
        <div className="flex items-center gap-2">
          <button
            aria-label="New group"
            onClick={onCreateNew}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            + New
          </button>
          <button
            aria-label="Done"
            onClick={onDone}
            className="text-sm text-slate-400 hover:text-slate-200"
          >
            Done
          </button>
        </div>
      </div>
      <ul className="flex flex-col gap-2 p-4">
        {groups.map((group) => (
          <li key={group.id} className="bg-slate-800 rounded-xl px-4 py-3 flex items-center gap-3">
            {group.emoji && <span className="text-xl">{group.emoji}</span>}
            <span className="flex-1 text-sm font-medium text-white">{group.name}</span>

            {confirmingId === group.id ? (
              <div className="flex gap-2">
                <button
                  aria-label="Confirm delete"
                  onClick={() => handleConfirmDelete(group)}
                  className="text-xs text-red-400 border border-red-500/40 rounded-lg px-2 py-1"
                >
                  Delete
                </button>
                <button
                  aria-label="Cancel"
                  onClick={() => setConfirmingId(null)}
                  className="text-xs text-slate-400 border border-slate-600 rounded-lg px-2 py-1"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  aria-label={`Edit ${group.name}`}
                  onClick={() => onEdit(group)}
                  className="text-xs text-slate-400 hover:text-slate-200 border border-slate-600 rounded-lg px-2 py-1"
                >
                  Edit
                </button>
                <button
                  aria-label={`Delete ${group.name}`}
                  onClick={() => setConfirmingId(group.id ?? null)}
                  className="text-xs text-slate-400 hover:text-red-400 border border-slate-600 rounded-lg px-2 py-1"
                >
                  Delete
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
