import { FilterIcon } from "../icons/FilterIcon";
import { useState } from "react";
import { useGroups } from "../hooks/useGroups";
import { useViewStore } from "../store/viewStore";
import type { Group } from "../db/schema";

interface Props {
  userId: string | null;
  onManageGroups: () => void;
}

export function GroupSearchPanel({ userId, onManageGroups }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const groups = useGroups(userId);
  const selectedGroupId = useViewStore((s) => s.selectedGroupId);
  const setSelectedGroup = useViewStore((s) => s.setSelectedGroup);
  const clearSelectedGroup = useViewStore((s) => s.clearSelectedGroup);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null;

  const filtered = query.trim()
    ? groups.filter((g) => g.name.toLowerCase().includes(query.toLowerCase()))
    : groups;

  function handleSelect(group: Group) {
    if (group.id === undefined) return;
    setSelectedGroup(group.id);
    setOpen(false);
    setQuery("");
  }

  function close() {
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="relative flex items-center gap-2">
      {/* Filter icon trigger */}
      <button
        aria-label="Filter by group"
        onClick={() => setOpen((o) => !o)}
        className={`p-2 rounded-lg transition-colors ${
          open || selectedGroupId !== null
            ? "text-accent bg-accent/10"
            : "text-ink-muted hover:text-ink hover:bg-surface"
        }`}
      >
        <FilterIcon className="icon-md" />
      </button>

      {/* Active filter badge */}
      {selectedGroup && (
        <div className="flex items-center gap-1.5 bg-accent/20 border border-accent/40 rounded-full pl-3 pr-1 py-1 text-sm text-accent">
          {selectedGroup.emoji && <span>{selectedGroup.emoji}</span>}
          <span className="max-w-[120px] truncate">{selectedGroup.name}</span>
          <button
            aria-label="Clear filter"
            onClick={clearSelectedGroup}
            className="flex items-center justify-center w-6 h-6 rounded-full hover:bg-accent/30 text-accent hover:text-accent/80 transition-colors"
          >
            ×
          </button>
        </div>
      )}

      {/* Tap-away overlay */}
      {open && <div className="fixed inset-0 z-10" onClick={close} />}

      {/* Floating dropdown */}
      {open && (
        <div className="absolute top-full left-0 mt-2 z-20 w-72 bg-surface border border-line rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="p-3 border-b border-line">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search groups…"
              autoFocus
              className="w-full bg-surface-raised rounded-xl px-4 py-3 text-base text-ink placeholder-ink-faint outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <ul className="flex flex-col overflow-y-auto max-h-64">
            {filtered.length === 0 && (
              <li className="px-4 py-4 text-sm text-ink-faint text-center">
                No groups found
              </li>
            )}
            {filtered.map((group) => (
              <li key={group.id}>
                <button
                  onClick={() => handleSelect(group)}
                  className={`w-full text-left flex items-center gap-3 px-4 py-4 text-base transition-colors ${
                    group.id === selectedGroupId
                      ? "bg-accent text-on-accent"
                      : "text-ink hover:bg-surface-raised active:bg-surface-strong"
                  }`}
                >
                  {group.emoji ? (
                    <span className="text-xl w-7 text-center">
                      {group.emoji}
                    </span>
                  ) : (
                    <span className="w-7" />
                  )}
                  {group.name}
                </button>
              </li>
            ))}
          </ul>

          <div className="border-t border-line">
            <button
              onClick={() => {
                close();
                onManageGroups();
              }}
              className="w-full text-left px-4 py-4 text-base text-ink-muted hover:text-ink hover:bg-surface-raised transition-colors"
            >
              Manage groups →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
