import { useState } from "react";
import { useGroups, deleteGroup } from "../hooks/useGroups";
import { ScreenTitle } from "./ScreenTitle";
import type { Group } from "../db/schema";

interface Props {
  userId: string | null;
  onEdit: (group: Group) => void;
  onCreateNew: () => void;
  onDone: () => void;
}

export function GroupListView({ userId, onEdit, onCreateNew, onDone }: Props) {
  const groups = useGroups(userId);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  async function handleConfirmDelete(group: Group) {
    await deleteGroup(group);
    setConfirmingId(null);
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="flex items-baseline justify-between pr-4">
        <ScreenTitle title="Groups" />
        <button
          aria-label="Done"
          onClick={onDone}
          className="text-base font-medium text-blue-400 hover:text-blue-300 px-2"
        >
          Done
        </button>
      </div>

      <ul className="flex flex-col gap-2 p-4">
        <li>
          <button
            aria-label="New group"
            onClick={onCreateNew}
            className="w-full flex items-center justify-center gap-3 bg-blue-600 rounded-xl px-4 py-4 text-base font-medium text-white hover:bg-blue-500 active:bg-blue-700 transition-colors"
          >
            <span className="text-xl w-7 text-center">＋</span>
            New group
          </button>
        </li>

        {groups.map((group) => (
          <li
            key={group.id}
            className="bg-slate-800 rounded-xl flex items-center gap-3 px-4 py-4"
          >
            {group.emoji ? (
              <span className="text-xl w-7 text-center">{group.emoji}</span>
            ) : (
              <span className="w-7" />
            )}
            <span className="flex-1 text-base font-medium text-white">
              {group.name}
            </span>

            {confirmingId === group.id ? (
              <div className="flex gap-2">
                <button
                  aria-label="Confirm delete"
                  onClick={() => handleConfirmDelete(group)}
                  className="text-base font-medium text-white bg-red-700 rounded-xl px-4 py-3 min-h-[48px] hover:bg-red-600 active:scale-95 transition-all"
                >
                  DROP?
                </button>
                <button
                  aria-label="Cancel"
                  onClick={() => setConfirmingId(null)}
                  className="text-base font-medium text-white bg-slate-600 rounded-xl px-4 py-3 min-h-[48px] hover:bg-slate-500 active:scale-95 transition-all"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  aria-label={`Edit ${group.name}`}
                  onClick={() => onEdit(group)}
                  className="text-base font-medium text-white bg-slate-600 rounded-xl px-4 py-3 min-h-[48px] hover:bg-slate-500 active:scale-95 transition-all"
                >
                  Edit
                </button>
                <button
                  aria-label={`Delete ${group.name}`}
                  onClick={() => setConfirmingId(group.id ?? null)}
                  className="text-base font-medium text-white bg-slate-600 rounded-xl w-12 py-3 min-h-[48px] hover:bg-slate-500 active:scale-95 transition-all"
                >
                  🗑️
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
