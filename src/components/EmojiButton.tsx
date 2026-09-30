import { useState } from "react";

const CURATED_EMOJIS = [
  "🏃",
  "🚴",
  "🏋️",
  "🧘",
  "🚶",
  "💪",
  "🎯",
  "⚽",
  "🍕",
  "🍎",
  "🥗",
  "☕",
  "💧",
  "🍜",
  "🥤",
  "🍳",
  "💊",
  "🩺",
  "😴",
  "🛁",
  "🪥",
  "❤️",
  "🧠",
  "🌡️",
  "📚",
  "💻",
  "✉️",
  "📞",
  "🗓️",
  "📝",
  "💡",
  "🔔",
  "⏰",
  "⏳",
  "🔥",
  "⭐",
  "🎉",
  "🧹",
  "🛒",
  "🌙",
  "🎵",
  "🎮",
  "🐕",
  "🌿",
  "🚗",
  "✈️",
  "🏠",
  "💰",
];

interface Props {
  value: string;
  onChange: (emoji: string) => void;
}

export function EmojiButton({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Pick emoji"
        className="h-[52px] flex items-center justify-center rounded-lg bg-surface-raised text-xl hover:bg-surface-strong active:scale-95 transition-all px-1"
      >
        {value || "🙂+"}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute top-full right-0 z-50 mt-1 bg-surface border border-line-strong rounded-xl p-2 shadow-xl overflow-x-auto"
            style={{ maxWidth: "calc(100vw - 1rem)" }}
          >
            <div className="flex gap-1 w-max">
              {CURATED_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    onChange(emoji);
                    setOpen(false);
                  }}
                  className="w-10 h-10 flex items-center justify-center text-2xl rounded-lg hover:bg-surface-raised active:scale-90 transition-all shrink-0"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
