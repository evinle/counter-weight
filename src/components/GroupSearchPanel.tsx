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
            ? "text-blue-400 bg-blue-500/10"
            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
        }`}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M3 4a1 1 0 011-1h12a1 1 0 01.707 1.707L13 9.414V15a1 1 0 01-.553.894l-4 2A1 1 0 017 17v-7.586L3.293 5.707A1 1 0 013 5V4z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* Active filter badge */}
      {selectedGroup && (
        <div className="flex items-center gap-1.5 bg-blue-600/20 border border-blue-500/40 rounded-full pl-3 pr-1 py-1 text-sm text-blue-300">
          {selectedGroup.emoji && <span>{selectedGroup.emoji}</span>}
          <span className="max-w-[120px] truncate">{selectedGroup.name}</span>
          <button
            aria-label="Clear filter"
            onClick={clearSelectedGroup}
            className="flex items-center justify-center w-6 h-6 rounded-full hover:bg-blue-500/30 text-blue-400 hover:text-blue-200 transition-colors"
          >
            ×
          </button>
        </div>
      )}

      {/* Tap-away overlay */}
      {open && (
        <div className="fixed inset-0 z-10" onClick={close} />
      )}

      {/* Floating dropdown */}
      {open && (
        <div className="absolute top-full left-0 mt-2 z-20 w-72 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="p-3 border-b border-slate-700">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search groups…"
              autoFocus
              className="w-full bg-slate-700 rounded-xl px-4 py-3 text-base text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <ul className="flex flex-col overflow-y-auto max-h-64">
            {filtered.length === 0 && (
              <li className="px-4 py-4 text-sm text-slate-500 text-center">
                No groups found
              </li>
            )}
            {filtered.map((group) => (
              <li key={group.id}>
                <button
                  onClick={() => handleSelect(group)}
                  className={`w-full text-left flex items-center gap-3 px-4 py-4 text-base transition-colors ${
                    group.id === selectedGroupId
                      ? "bg-blue-600 text-white"
                      : "text-slate-200 hover:bg-slate-700 active:bg-slate-600"
                  }`}
                >
                  {group.emoji ? (
                    <span className="text-xl w-7 text-center">{group.emoji}</span>
                  ) : (
                    <span className="w-7" />
                  )}
                  {group.name}
                </button>
              </li>
            ))}
          </ul>

          <div className="border-t border-slate-700">
            <button
              onClick={() => { close(); onManageGroups(); }}
              className="w-full text-left px-4 py-4 text-base text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
            >
              Manage groups →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
