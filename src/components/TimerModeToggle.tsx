import { TimerMode } from "../lib/timerForm";

interface Props {
  mode: TimerMode;
  onChange: (mode: TimerMode) => void;
  allowRecurring: boolean;
}

function ModeButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-3 text-base font-medium transition-colors ${
        active ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-400"
      }`}
    >
      {label}
    </button>
  );
}

export function TimerModeToggle({ mode, onChange, allowRecurring }: Props) {
  return (
    <div className="h-12 flex rounded-xl overflow-hidden border border-slate-600">
      <ModeButton
        active={mode === TimerMode.AtTime}
        label="At time"
        onClick={() => onChange(TimerMode.AtTime)}
      />
      {allowRecurring && (
        <ModeButton
          active={mode === TimerMode.Recurrence}
          label="Recurring"
          onClick={() => onChange(TimerMode.Recurrence)}
        />
      )}
      <ModeButton
        active={mode === TimerMode.FromNow}
        label="From now"
        onClick={() => onChange(TimerMode.FromNow)}
      />
    </div>
  );
}
