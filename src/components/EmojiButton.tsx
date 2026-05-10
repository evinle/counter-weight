import { useState } from 'react'

const CURATED_EMOJIS = [
  '🏃', '🚴', '🏋️', '🧘', '🚶', '💪', '🎯', '⚽',
  '🍕', '🍎', '🥗', '☕', '💧', '🍜', '🥤', '🍳',
  '💊', '🩺', '😴', '🛁', '🪥', '❤️', '🧠', '🌡️',
  '📚', '💻', '✉️', '📞', '🗓️', '📝', '💡', '🔔',
  '⏰', '⏳', '🔥', '⭐', '🎉', '🧹', '🛒', '🌙',
  '🎵', '🎮', '🐕', '🌿', '🚗', '✈️', '🏠', '💰',
]

interface Props {
  value: string
  onChange: (emoji: string) => void
}

export function EmojiButton({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Pick emoji"
        className="w-[52px] h-[52px] flex items-center justify-center rounded-lg bg-slate-700 text-2xl hover:bg-slate-600 active:scale-95 transition-all shrink-0"
      >
        {value || '🙂+'}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-0 z-50 mt-1 bg-slate-800 border border-slate-600 rounded-xl p-2 shadow-xl overflow-x-auto max-w-[90vw]">
            <div className="flex gap-1" style={{ width: 'max-content' }}>
              {CURATED_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => { onChange(emoji); setOpen(false) }}
                  className="w-10 h-10 flex items-center justify-center text-2xl rounded-lg hover:bg-slate-700 active:scale-90 transition-all shrink-0"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
