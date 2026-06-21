import { useState } from "react";
import { createGroup, updateGroup } from "../hooks/useGroups";
import { useUserTags } from "../hooks/useTags";
import { ScreenTitle } from "./ScreenTitle";
import { EmojiButton } from "./EmojiButton";
import type {
  Group,
  GroupConditions,
  FieldCondition,
  Priority,
  TimerStatus,
  Tag,
} from "../db/schema";
import { PRIORITIES, TIMER_STATUSES } from "../db/schema";

const PRESET_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#6b7280",
];

type ConditionField = FieldCondition["field"];

const FIELD_OPTIONS: { value: ConditionField; label: string }[] = [
  { value: "priority", label: "Priority" },
  { value: "status", label: "Status" },
  { value: "tags", label: "Tags" },
  { value: "targetDatetime", label: "Due date" },
  { value: "title", label: "Title" },
  { value: "recurrenceRule", label: "Recurrence" },
];

const OPS_BY_FIELD: Record<ConditionField, { value: string; label: string }[]> =
  {
    priority: [
      { value: "eq", label: "is" },
      { value: "in", label: "is one of" },
    ],
    status: [
      { value: "eq", label: "is" },
      { value: "in", label: "is one of" },
    ],
    tags: [
      { value: "contains", label: "contains" },
      { value: "in", label: "is any of" },
    ],
    targetDatetime: [
      { value: "overdue", label: "is overdue" },
      { value: "today", label: "is today" },
      { value: "within_days", label: "within days" },
      { value: "before", label: "before" },
      { value: "after", label: "after" },
    ],
    title: [{ value: "contains", label: "contains" }],
    recurrenceRule: [
      { value: "exists", label: "exists" },
      { value: "not_exists", label: "does not exist" },
    ],
    emoji: [{ value: "eq", label: "is" }],
  };

const ARRAY_OPS = new Set(["in"]);

function isArrayOp(op: string): boolean {
  return ARRAY_OPS.has(op);
}

type DraftCondition = {
  field: ConditionField;
  op: string;
  value: string | string[];
};

function defaultOp(field: ConditionField): string {
  return OPS_BY_FIELD[field][0].value;
}

function draftToFieldCondition(draft: DraftCondition): FieldCondition | null {
  const { field, op, value } = draft;
  if (field === "priority") {
    if (op === "eq" && PRIORITIES.includes(value as Priority)) {
      return { field, op, value: value as Priority };
    }
    if (op === "in") {
      const vals = (Array.isArray(value) ? value : [value]).filter((v) =>
        PRIORITIES.includes(v as Priority),
      ) as Priority[];
      if (vals.length > 0) return { field, op, value: vals };
    }
  }
  if (field === "status") {
    if (op === "eq" && TIMER_STATUSES.includes(value as TimerStatus)) {
      return { field, op, value: value as TimerStatus };
    }
    if (op === "in") {
      const vals = (Array.isArray(value) ? value : [value]).filter((v) =>
        TIMER_STATUSES.includes(v as TimerStatus),
      ) as TimerStatus[];
      if (vals.length > 0) return { field, op, value: vals };
    }
  }
  if (field === "tags") {
    if (op === "contains" && typeof value === "string")
      return { field, op, value };
    if (op === "in") {
      const vals = (Array.isArray(value) ? value : [value]).filter(Boolean);
      if (vals.length > 0) return { field, op, value: vals };
    }
  }
  if (field === "targetDatetime") {
    if (op === "overdue") return { field, op };
    if (op === "today") return { field, op };
    if (op === "within_days") return { field, op, value: Number(value) || 7 };
    if (op === "before" || op === "after")
      return { field, op, value: value as string };
  }
  if (field === "title" && op === "contains")
    return { field, op, value: value as string };
  if (field === "recurrenceRule") {
    if (op === "exists") return { field, op };
    if (op === "not_exists") return { field, op };
  }
  if (field === "emoji" && op === "eq")
    return { field, op, value: value as string };
  return null;
}

interface Props {
  existing?: Group;
  onDone: () => void;
  onCancel: () => void;
  userId: string | null;
}

export function GroupCreateEditView({
  existing,
  onDone,
  onCancel,
  userId,
}: Props) {
  const [name, setName] = useState(existing?.name ?? "");
  const [emoji, setEmoji] = useState(existing?.emoji ?? "");
  const [color, setColor] = useState(existing?.color ?? "");
  const tags = useUserTags(userId);
  const [drafts, setDrafts] = useState<DraftCondition[]>(
    () =>
      existing?.conditions.conditions.map((c) => ({
        field: c.field,
        op: c.op,
        value:
          "value" in c
            ? Array.isArray(c.value)
              ? c.value.map(String)
              : String(c.value)
            : "",
      })) ?? [],
  );

  function addCondition() {
    setDrafts((prev) => [...prev, { field: "priority", op: "eq", value: "" }]);
  }

  function updateDraft(index: number, patch: Partial<DraftCondition>) {
    setDrafts((prev) =>
      prev.map((d, i) => {
        if (i !== index) return d;
        const next = { ...d, ...patch };
        if (patch.field && patch.field !== d.field) {
          next.op = defaultOp(patch.field);
          next.value = isArrayOp(defaultOp(patch.field)) ? [] : "";
        }
        if (patch.op && patch.op !== d.op) {
          next.value = isArrayOp(patch.op) ? [] : "";
        }
        return next;
      }),
    );
  }

  function removeDraft(index: number) {
    setDrafts((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const conditions: FieldCondition[] = drafts
      .map(draftToFieldCondition)
      .filter((c): c is FieldCondition => c !== null);

    const groupConditions: GroupConditions = { op: "AND", conditions };

    if (existing?.id !== undefined) {
      await updateGroup(existing.id, {
        name,
        emoji: emoji || null,
        color: color || null,
        conditions: groupConditions,
      });
    } else {
      await createGroup(
        {
          name,
          emoji: emoji || null,
          color: color || null,
          conditions: groupConditions,
        },
        userId,
      );
    }
    onDone();
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <ScreenTitle title={existing ? "Edit Group" : "New Group"} />
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="group-name" className="text-sm text-slate-400">
            Name
          </label>
          <div className="flex gap-2 items-center">
            <input
              id="group-name"
              aria-label="Name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Group name"
              className="flex-1 rounded-lg p-3 bg-slate-700 text-white text-base placeholder:text-slate-400 min-h-[52px]"
            />
            <EmojiButton value={emoji} onChange={setEmoji} />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-slate-400">Color</span>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor((prev) => (prev === c ? "" : c))}
                  aria-label={c}
                  className={`w-7 h-7 rounded-full transition-all cursor-pointer ${
                    color === c
                      ? "ring-2 ring-white ring-offset-2 ring-offset-slate-800"
                      : ""
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm text-slate-400">
            Conditions (ALL must match)
          </span>
          {drafts.map((draft, i) => (
            <ConditionRow
              key={i}
              draft={draft}
              tags={tags}
              onChange={(patch) => updateDraft(i, patch)}
              onRemove={() => removeDraft(i)}
            />
          ))}
          <button
            type="button"
            aria-label="Add condition"
            onClick={addCondition}
            className="text-sm text-blue-400 hover:text-blue-300 text-left"
          >
            + Add condition
          </button>
        </div>

        <button
          type="submit"
          aria-label="Save"
          disabled={!name.trim()}
          className="bg-blue-600 text-white font-semibold rounded-xl py-3 disabled:opacity-40"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-slate-400 text-base py-3"
        >
          Cancel
        </button>
      </form>
    </div>
  );
}

interface ConditionRowProps {
  draft: DraftCondition;
  tags: Tag[];
  onChange: (patch: Partial<DraftCondition>) => void;
  onRemove: () => void;
}

function ConditionRow({ draft, tags, onChange, onRemove }: ConditionRowProps) {
  const ops = OPS_BY_FIELD[draft.field] ?? [];
  const needsValue = !["overdue", "today", "exists", "not_exists"].includes(
    draft.op,
  );

  function addValueItem() {
    const current = Array.isArray(draft.value) ? draft.value : [];
    onChange({ value: [...current, ""] });
  }

  function updateValueItem(index: number, item: string) {
    const current = Array.isArray(draft.value) ? draft.value : [];
    onChange({ value: current.map((v, i) => (i === index ? item : v)) });
  }

  function removeValueItem(index: number) {
    const current = Array.isArray(draft.value) ? draft.value : [];
    onChange({ value: current.filter((_, i) => i !== index) });
  }

  function renderValueInput() {
    if (!needsValue) return null;

    const selectClass =
      "flex-1 bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-white text-sm outline-none";
    const inputClass =
      "flex-1 bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-white text-sm outline-none min-w-0";

    if (isArrayOp(draft.op)) {
      const items = Array.isArray(draft.value) ? draft.value : [];

      function optionsForField() {
        if (draft.field === "tags") {
          return tags
            .filter((t) => t.serverId)
            .map((t) => (
              <option key={t.serverId} value={t.serverId!}>
                {t.name}
              </option>
            ));
        }
        if (draft.field === "priority") {
          return PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ));
        }
        if (draft.field === "status") {
          return TIMER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ));
        }
        return null;
      }

      return (
        <div className="flex flex-col gap-1 h-full w-full items-center">
          {items.map((item, idx) => (
            <div key={idx} className="flex items-center gap-1">
              <select
                aria-label="Value"
                value={item}
                onChange={(e) => updateValueItem(idx, e.target.value)}
                className={selectClass}
              >
                <option value="">Select…</option>
                {optionsForField()}
              </select>
              <button
                type="button"
                aria-label="Remove value"
                onClick={() => removeValueItem(idx)}
                className="text-slate-500 hover:text-red-400 text-lg font-bold px-1"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            aria-label="Add value"
            onClick={addValueItem}
            className="text-xs text-blue-400 hover:text-blue-300 h-full"
          >
            + Add value
          </button>
        </div>
      );
    }

    if (draft.field === "tags") {
      return (
        <select
          aria-label="Value"
          value={draft.value as string}
          onChange={(e) => onChange({ value: e.target.value })}
          className={selectClass}
        >
          <option value="">Select tag…</option>
          {tags
            .filter((t) => t.serverId)
            .map((t) => (
              <option key={t.serverId} value={t.serverId!}>
                {t.name}
              </option>
            ))}
        </select>
      );
    }

    if (draft.field === "priority" && draft.op === "eq") {
      return (
        <select
          aria-label="Value"
          value={draft.value as string}
          onChange={(e) => onChange({ value: e.target.value })}
          className={selectClass}
        >
          <option value="">Select…</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      );
    }

    if (draft.field === "status" && draft.op === "eq") {
      return (
        <select
          aria-label="Value"
          value={draft.value as string}
          onChange={(e) => onChange({ value: e.target.value })}
          className={selectClass}
        >
          <option value="">Select…</option>
          {TIMER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        aria-label="Value"
        type="text"
        value={draft.value as string}
        onChange={(e) => onChange({ value: e.target.value })}
        className={inputClass}
      />
    );
  }

  return (
    <div className="flex items-start gap-2">
      <button
        type="button"
        aria-label="Remove condition"
        onClick={onRemove}
        className="text-slate-500 hover:text-red-400 text-2xl font-bold mt-0.5"
      >
        ×
      </button>

      <select
        aria-label="Field"
        value={draft.field}
        onChange={(e) => onChange({ field: e.target.value as ConditionField })}
        className="bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-white text-sm outline-none"
      >
        {FIELD_OPTIONS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      <select
        aria-label="Operator"
        value={draft.op}
        onChange={(e) => onChange({ op: e.target.value })}
        className="bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-white text-sm outline-none"
      >
        {ops.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {renderValueInput()}
    </div>
  );
}
