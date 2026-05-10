import { useRef } from 'react'

export function applyBounds(value: number, min: number, max: number, clamp: boolean): number {
  if (clamp) return Math.min(max, Math.max(min, value))
  const range = max - min + 1
  return ((value - min) % range + range) % range + min
}

interface SpinnerFieldProps {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  clamp?: boolean
  label: string
}

export function SpinnerField({ value, onChange, min, max, clamp = false, label }: SpinnerFieldProps) {
  const dragRef = useRef<{ y: number; value: number; moved: boolean } | null>(null)

  const apply = (v: number) => onChange(applyBounds(v, min, max, clamp))

  return (
    <div className="flex flex-col items-center flex-1">
      <button
        type="button"
        onClick={() => apply(value + 1)}
        aria-label={`Increase ${label}`}
        className="flex items-center justify-center w-full min-h-[44px] text-slate-400 hover:text-white active:text-white transition-colors text-xl leading-none"
      >
        ▲
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={String(value).padStart(2, '0')}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const raw = parseInt(e.target.value.replace(/\D/g, ''), 10)
          if (!isNaN(raw)) apply(raw)
        }}
        onPointerDown={(e) => {
          e.preventDefault() // block browser text-drag so pointer capture works cleanly
          dragRef.current = { y: e.clientY, value, moved: false }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!dragRef.current) return
          const delta = Math.round((dragRef.current.y - e.clientY) / 8)
          if (delta !== 0) {
            dragRef.current.moved = true
            apply(dragRef.current.value + delta)
          }
        }}
        onPointerUp={(e) => {
          if (dragRef.current && !dragRef.current.moved) {
            e.currentTarget.focus()
            e.currentTarget.select()
          }
          dragRef.current = null
        }}
        onPointerCancel={() => { dragRef.current = null }}
        aria-label={label}
        className="w-full text-center text-2xl font-mono text-white bg-slate-700 rounded-lg py-3 cursor-ns-resize select-none"
      />
      <button
        type="button"
        onClick={() => apply(value - 1)}
        aria-label={`Decrease ${label}`}
        className="flex items-center justify-center w-full min-h-[44px] text-slate-400 hover:text-white active:text-white transition-colors text-xl leading-none"
      >
        ▼
      </button>
      <span className="text-xs text-slate-500 mt-0.5">{label}</span>
    </div>
  )
}
