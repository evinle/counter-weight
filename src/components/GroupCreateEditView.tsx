import { useState } from 'react'
import { createGroup, updateGroup } from '../hooks/useGroups'
import { ScreenTitle } from './ScreenTitle'
import type { Group, GroupConditions, FieldCondition, Priority, TimerStatus } from '../db/schema'
import { PRIORITIES, TIMER_STATUSES } from '../db/schema'

type ConditionField = FieldCondition['field']

const FIELD_OPTIONS: { value: ConditionField; label: string }[] = [
  { value: 'priority', label: 'Priority' },
  { value: 'status', label: 'Status' },
  { value: 'tags', label: 'Tags' },
  { value: 'targetDatetime', label: 'Due date' },
  { value: 'title', label: 'Title' },
  { value: 'recurrenceRule', label: 'Recurrence' },
]

const OPS_BY_FIELD: Record<ConditionField, { value: string; label: string }[]> = {
  priority: [
    { value: 'eq', label: 'is' },
    { value: 'in', label: 'is one of' },
  ],
  status: [
    { value: 'eq', label: 'is' },
    { value: 'in', label: 'is one of' },
  ],
  tags: [{ value: 'contains', label: 'contains' }],
  targetDatetime: [
    { value: 'overdue', label: 'is overdue' },
    { value: 'today', label: 'is today' },
    { value: 'within_days', label: 'within days' },
    { value: 'before', label: 'before' },
    { value: 'after', label: 'after' },
  ],
  title: [{ value: 'contains', label: 'contains' }],
  recurrenceRule: [
    { value: 'exists', label: 'exists' },
    { value: 'not_exists', label: 'does not exist' },
  ],
  emoji: [{ value: 'eq', label: 'is' }],
}

type DraftCondition = {
  field: ConditionField
  op: string
  value: string
}

function defaultOp(field: ConditionField): string {
  return OPS_BY_FIELD[field][0].value
}

function draftToFieldCondition(draft: DraftCondition): FieldCondition | null {
  const { field, op, value } = draft
  if (field === 'priority') {
    if (op === 'eq' && PRIORITIES.includes(value as Priority)) {
      return { field, op, value: value as Priority }
    }
    if (op === 'in') {
      const vals = value.split(',').filter((v) => PRIORITIES.includes(v as Priority)) as Priority[]
      if (vals.length > 0) return { field, op, value: vals }
    }
  }
  if (field === 'status') {
    if (op === 'eq' && TIMER_STATUSES.includes(value as TimerStatus)) {
      return { field, op, value: value as TimerStatus }
    }
    if (op === 'in') {
      const vals = value.split(',').filter((v) => TIMER_STATUSES.includes(v as TimerStatus)) as TimerStatus[]
      if (vals.length > 0) return { field, op, value: vals }
    }
  }
  if (field === 'tags' && op === 'contains') return { field, op, value }
  if (field === 'targetDatetime') {
    if (op === 'overdue') return { field, op }
    if (op === 'today') return { field, op }
    if (op === 'within_days') return { field, op, value: Number(value) || 7 }
    if (op === 'before' || op === 'after') return { field, op, value }
  }
  if (field === 'title' && op === 'contains') return { field, op, value }
  if (field === 'recurrenceRule') {
    if (op === 'exists') return { field, op }
    if (op === 'not_exists') return { field, op }
  }
  if (field === 'emoji' && op === 'eq') return { field, op, value }
  return null
}

interface Props {
  existing?: Group
  onDone: () => void
  userId: string | null
}

export function GroupCreateEditView({ existing, onDone, userId }: Props) {
  const [name, setName] = useState(existing?.name ?? '')
  const [emoji, setEmoji] = useState(existing?.emoji ?? '')
  const [color, setColor] = useState(existing?.color ?? '')
  const [drafts, setDrafts] = useState<DraftCondition[]>(() =>
    existing?.conditions.conditions.map((c) => ({
      field: c.field,
      op: c.op,
      value: 'value' in c ? String(Array.isArray(c.value) ? c.value.join(',') : c.value) : '',
    })) ?? []
  )

  function addCondition() {
    setDrafts((prev) => [...prev, { field: 'priority', op: 'eq', value: '' }])
  }

  function updateDraft(index: number, patch: Partial<DraftCondition>) {
    setDrafts((prev) =>
      prev.map((d, i) => {
        if (i !== index) return d
        const next = { ...d, ...patch }
        if (patch.field && patch.field !== d.field) {
          next.op = defaultOp(patch.field)
          next.value = ''
        }
        return next
      })
    )
  }

  function removeDraft(index: number) {
    setDrafts((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const conditions: FieldCondition[] = drafts
      .map(draftToFieldCondition)
      .filter((c): c is FieldCondition => c !== null)

    const groupConditions: GroupConditions = { op: 'AND', conditions }

    if (existing?.id !== undefined) {
      await updateGroup(existing.id, { name, emoji: emoji || null, color: color || null, conditions: groupConditions })
    } else {
      await createGroup({ name, emoji: emoji || null, color: color || null, conditions: groupConditions }, userId)
    }
    onDone()
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <ScreenTitle title={existing ? 'Edit Group' : 'New Group'} />
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="group-name" className="text-sm text-slate-400">
            Name
          </label>
          <input
            id="group-name"
            aria-label="Name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Group name"
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex gap-3">
          <div className="flex flex-col gap-1 flex-1">
            <label htmlFor="group-emoji" className="text-sm text-slate-400">
              Emoji
            </label>
            <input
              id="group-emoji"
              aria-label="Emoji"
              type="text"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder="🔴"
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label htmlFor="group-color" className="text-sm text-slate-400">
              Color
            </label>
            <input
              id="group-color"
              aria-label="Color"
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="#ef4444"
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm text-slate-400">Conditions (ALL must match)</span>
          {drafts.map((draft, i) => (
            <ConditionRow
              key={i}
              draft={draft}
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
      </form>
    </div>
  )
}

interface ConditionRowProps {
  draft: DraftCondition
  onChange: (patch: Partial<DraftCondition>) => void
  onRemove: () => void
}

function ConditionRow({ draft, onChange, onRemove }: ConditionRowProps) {
  const ops = OPS_BY_FIELD[draft.field] ?? []
  const needsValue = !['overdue', 'today', 'exists', 'not_exists'].includes(draft.op)

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="Field"
        value={draft.field}
        onChange={(e) => onChange({ field: e.target.value as ConditionField })}
        className="bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-white text-sm outline-none"
      >
        {FIELD_OPTIONS.map((f) => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>

      <select
        aria-label="Operator"
        value={draft.op}
        onChange={(e) => onChange({ op: e.target.value })}
        className="bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-white text-sm outline-none"
      >
        {ops.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {needsValue && (
        <input
          aria-label="Value"
          type="text"
          value={draft.value}
          onChange={(e) => onChange({ value: e.target.value })}
          className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-white text-sm outline-none"
        />
      )}

      <button
        type="button"
        aria-label="Remove condition"
        onClick={onRemove}
        className="text-slate-500 hover:text-red-400"
      >
        ×
      </button>
    </div>
  )
}
