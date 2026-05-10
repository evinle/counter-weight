import { useState } from 'react'
import { createTimer, rescheduleTimer } from '../hooks/useTimers'
import type { Timer, Priority } from '../db/schema'

interface Props {
  existing?: Timer
  onDone: () => void
}

export function CreateEditView({ existing, onDone }: Props) {
  const [title, setTitle] = useState(existing?.title ?? '')
  const [emoji, setEmoji] = useState(existing?.emoji ?? '')
  const [priority, setPriority] = useState<Priority>(existing?.priority ?? 'medium')
  const [isFlagged, setIsFlagged] = useState(existing?.isFlagged ?? false)
  const [targetInput, setTargetInput] = useState(() => {
    if (existing) return existing.targetDatetime.toISOString().slice(0, 16)
    return ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const targetDatetime = new Date(targetInput)

    if (existing?.id !== undefined) {
      await rescheduleTimer(existing.id, targetDatetime)
    } else {
      await createTimer({
        title,
        emoji: emoji || null,
        description: null,
        targetDatetime,
        status: 'active',
        priority,
        isFlagged,
        groupId: null,
        recurrenceRule: null,
      })
    }
    onDone()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
      <input
        className="rounded-lg p-3 bg-slate-700 text-white placeholder:text-slate-400"
        placeholder="Timer title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      <input
        className="rounded-lg p-3 bg-slate-700 text-white placeholder:text-slate-400"
        placeholder="Emoji (optional)"
        value={emoji}
        onChange={(e) => setEmoji(e.target.value)}
      />
      <input
        type="datetime-local"
        className="rounded-lg p-3 bg-slate-700 text-white"
        value={targetInput}
        onChange={(e) => setTargetInput(e.target.value)}
        required
      />
      <select
        className="rounded-lg p-3 bg-slate-700 text-white"
        value={priority}
        onChange={(e) => setPriority(e.target.value as Priority)}
      >
        {(['low', 'medium', 'high', 'critical'] as Priority[]).map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-white cursor-pointer">
        <input
          type="checkbox"
          checked={isFlagged}
          onChange={(e) => setIsFlagged(e.target.checked)}
        />
        Flag this timer
      </label>
      <button
        type="submit"
        className="rounded-lg p-3 bg-blue-600 text-white font-semibold"
      >
        {existing ? 'Update Timer' : 'Create Timer'}
      </button>
    </form>
  )
}
