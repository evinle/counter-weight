import { TrashIcon } from "../icons/TrashIcon";
import { useState, useRef, useEffect } from "react";
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
  const dropTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function armDrop(id: number) {
    setConfirmingId(id);
    dropTimeoutRef.current = setTimeout(() => setConfirmingId(null), 2000);
  }

  async function confirmDrop(group: Group) {
    if (dropTimeoutRef.current) clearTimeout(dropTimeoutRef.current);
    setConfirmingId(null);
    await deleteGroup(group);
  }

  useEffect(() => {
    return () => {
      if (dropTimeoutRef.current) clearTimeout(dropTimeoutRef.current);
    };
  }, []);

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="flex items-baseline justify-between pr-4">
        <ScreenTitle title="Groups" />
        <button
          aria-label="Done"
          onClick={onDone}
          className="text-base font-medium text-accent hover:text-accent/80 px-2"
        >
          Done
        </button>
      </div>

      <ul className="flex flex-col gap-2 p-4">
        <li>
          <button
            aria-label="New group"
            onClick={onCreateNew}
            className="w-full flex items-center justify-center gap-3 bg-accent rounded-xl px-4 py-4 text-base font-medium text-on-accent hover:bg-accent/90 active:bg-accent/80 transition-colors"
          >
            <span className="text-xl w-7 text-center">＋</span>
            New group
          </button>
        </li>

        {groups.map((group) => (
          <li
            key={group.id}
            className="bg-surface rounded-xl flex items-center gap-3 px-4 py-4"
          >
            {group.emoji ? (
              <span className="text-xl w-7 text-center">{group.emoji}</span>
            ) : (
              <span className="w-7" />
            )}
            <span className="flex-1 text-base font-medium text-ink">
              {group.name}
            </span>

            {confirmingId === group.id ? (
              <button
                aria-label="Confirm delete"
                onClick={() => void confirmDrop(group)}
                className="text-base font-medium text-on-accent bg-danger rounded-xl px-4 py-3 min-h-[48px] hover:bg-danger/90 active:scale-95 transition-all"
              >
                DROP?
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  aria-label={`Edit ${group.name}`}
                  onClick={() => onEdit(group)}
                  className="text-base font-medium text-ink bg-surface-strong rounded-xl px-4 py-3 min-h-[48px] hover:bg-line-strong active:scale-95 transition-all"
                >
                  Edit
                </button>
                <button
                  aria-label={`Delete ${group.name}`}
                  onClick={() => armDrop(group.id ?? 0)}
                  className="flex items-center justify-center text-base font-medium text-ink bg-surface-strong rounded-xl w-12 py-3 min-h-[48px] hover:bg-line-strong active:scale-95 transition-all"
                >
                  <TrashIcon className="icon-md" />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
