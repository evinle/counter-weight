interface OptionalFieldProps {
  label: string
  activateLabel: string
  clearLabel: string
  active: boolean
  onActivate: () => void
  onClear: () => void
  children: React.ReactNode
}

export function OptionalField({
  label,
  activateLabel,
  clearLabel,
  active,
  onActivate,
  onClear,
  children,
}: OptionalFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-400">{label}</span>
        {!active && (
          <button
            type="button"
            onClick={onActivate}
            className="text-sm text-blue-400 font-medium active:opacity-60 transition-opacity"
          >
            {activateLabel}
          </button>
        )}
      </div>
      {active && (
        <div className="flex flex-col gap-4">
          {children}
          <button
            type="button"
            onClick={onClear}
            className="text-sm text-slate-500 active:opacity-60 transition-opacity"
          >
            {clearLabel}
          </button>
        </div>
      )}
    </div>
  )
}
