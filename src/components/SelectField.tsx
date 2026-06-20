interface Props {
  label: string
  id?: string
  'aria-label'?: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}

export function SelectField({ label, id, 'aria-label': ariaLabel, value, onChange, children }: Props) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-slate-400">
        {label}
      </label>
      <select
        id={id}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg p-3 bg-slate-700 text-white text-base min-h-[52px]"
      >
        {children}
      </select>
    </div>
  )
}
