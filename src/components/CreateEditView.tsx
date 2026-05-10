import { useState } from 'react'
import EmojiPicker, { Theme, type EmojiClickData } from 'emoji-picker-react'
import { createTimer, rescheduleTimer } from '../hooks/useTimers'
import { DurationInput } from './DurationInput'
import { durationToMs, msToDuration } from '../lib/duration'
import type { DurationValue } from '../lib/duration'
import { timeRemaining } from '../lib/countdown'
import { PRIORITIES, isPriority } from '../db/schema'
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
  const [showPicker, setShowPicker] = useState(false)
  const [duration, setDuration] = useState<DurationValue>(() => {
    if (existing) return msToDuration(timeRemaining(existing.targetDatetime))
    return { days: 0, hours: 0, minutes: 5 }
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const targetDatetime = new Date(
      Date.now() + durationToMs(duration.days, duration.hours, duration.minutes)
    )

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
    <>
      {showPicker && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
          onClick={() => setShowPicker(false)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <EmojiPicker
              onEmojiClick={(data: EmojiClickData) => {
                setEmoji(data.emoji)
                setShowPicker(false)
              }}
              theme={Theme.DARK}
            />
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="timer-title" className="text-sm text-slate-400">Title</label>
          <input
            id="timer-title"
            className="rounded-lg p-3 bg-slate-700 text-white text-base placeholder:text-slate-400 min-h-[52px]"
            placeholder="What are you timing?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-slate-400">Emoji</label>
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="rounded-lg p-3 bg-slate-700 text-white text-base text-left min-h-[52px] hover:bg-slate-600 active:scale-95 transition-all"
          >
            {emoji
              ? <span className="text-2xl">{emoji}</span>
              : <span className="text-slate-400">Pick an emoji (optional)</span>
            }
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-slate-400">Time from now</label>
          <DurationInput value={duration} onChange={setDuration} />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="timer-priority" className="text-sm text-slate-400">Priority</label>
          <select
            id="timer-priority"
            className="rounded-lg p-3 bg-slate-700 text-white text-base min-h-[52px]"
            value={priority}
            onChange={(e) => { if (isPriority(e.target.value)) setPriority(e.target.value) }}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-3 text-white text-base cursor-pointer min-h-[44px]">
          <input
            type="checkbox"
            className="w-5 h-5"
            checked={isFlagged}
            onChange={(e) => setIsFlagged(e.target.checked)}
          />
          Flag this timer
        </label>

        <button
          type="submit"
          className="rounded-lg p-4 bg-blue-600 text-white text-base font-semibold min-h-[52px] hover:bg-blue-500 active:scale-95 transition-all"
        >
          {existing ? 'Update Timer' : 'Create Timer'}
        </button>
      </form>
    </>
  )
}
