interface Props {
  label: string
  id?: string
  'aria-label'?: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
  variant?: 'default' | 'sub'
}

const SELECT_CLASS = {
  default: 'rounded-lg p-3 bg-surface-raised text-ink text-base min-h-[52px]',
  sub: 'rounded-md p-2 bg-surface text-ink text-sm',
} as const

const LABEL_CLASS = {
  default: 'text-sm text-ink-muted',
  sub: 'text-xs text-ink-faint',
} as const

export function SelectField({ label, id, 'aria-label': ariaLabel, value, onChange, children, variant = 'default' }: Props) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={LABEL_CLASS[variant]}>
        {label}
      </label>
      <select
        id={id}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={SELECT_CLASS[variant]}
      >
        {children}
      </select>
    </div>
  )
}
