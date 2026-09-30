import type { ReactNode } from "react";
import { DurationPicker } from "./DurationPicker";
import { EmojiButton } from "./EmojiButton";
import { TagPicker } from "./TagPicker";
import { OptionalField } from "./OptionalField";
import { SelectField } from "./SelectField";
import { durationToMs, msToDuration } from "../lib/duration";
import { formatLeadNotificationPreview } from "../lib/countdown";
import { PRIORITIES, isPriority, TimerType } from "../db/schema";
import type { CommonFields } from "../hooks/useTimerForm";

interface Props {
  fields: CommonFields;
  userId: string | null;
  initialTagServerIds?: string[];
  /** The time section: differs between create and edit. */
  timeSection: ReactNode;
  targetMs: number | null;
  leadMaxDays: number;
  getNow: () => number;
  submitLabel: string;
  submitDisabled: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

/** Everything the create and edit timer forms share, around a time-section slot. */
export function TimerFormFrame({
  fields,
  userId,
  initialTagServerIds,
  timeSection,
  targetMs,
  leadMaxDays,
  getNow,
  submitLabel,
  submitDisabled,
  onSubmit,
  onCancel,
}: Props) {
  const { leadTimeMs } = fields;
  const leadDuration = msToDuration(leadTimeMs ?? 0);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const leadPreview =
    leadTimeMs !== null && targetMs !== null
      ? formatLeadNotificationPreview(targetMs, leadTimeMs, new Date(getNow()), tz)
      : null;

  return (
    <form
      onSubmit={onSubmit}
      className="overflow-y-auto overflow-x-hidden h-full box-border"
    >
      <div className="flex flex-col gap-5 px-4 pt-4">
        <div className="flex gap-2 items-center">
          <input
            id="timer-title"
            className="flex-1 rounded-lg p-3 bg-surface-raised text-ink text-base placeholder:text-ink-muted min-h-[52px]"
            placeholder="What are you timing?"
            value={fields.title}
            onChange={(e) => fields.setTitle(e.target.value)}
            required
          />
          <EmojiButton value={fields.emoji} onChange={fields.setEmoji} />
        </div>

        {timeSection}

        <SelectField
          label="Priority"
          id="timer-priority"
          value={fields.priority}
          onChange={(v) => {
            if (isPriority(v)) fields.setPriority(v);
          }}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </SelectField>

        <div className="flex flex-col gap-1">
          <span className="text-sm text-ink-muted">Tags</span>
          <TagPicker
            userId={userId}
            initialServerIds={initialTagServerIds}
            onChange={fields.setTagIds}
          />
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            aria-label="Task"
            className="w-5 h-5 rounded accent-accent"
            checked={fields.isTask}
            onChange={(e) =>
              fields.setTimerType(
                e.target.checked ? TimerType.Task : TimerType.Reminder,
              )
            }
          />
          <span className="text-sm text-ink-muted">Task</span>
        </label>

        <OptionalField
          label="Remind me before"
          activateLabel="Set time"
          clearLabel="Cancel reminder"
          active={leadTimeMs !== null}
          onActivate={() => fields.setLeadTimeMs(0)}
          onClear={() => fields.setLeadTimeMs(null)}
        >
          <div data-testid="lead-time-fields">
            <DurationPicker
              value={leadDuration}
              onChange={(d) =>
                fields.setLeadTimeMs(durationToMs(d.days, d.hours, d.minutes))
              }
              maxDays={leadMaxDays}
            />
          </div>
          {leadPreview !== null && (
            <p
              className="text-sm text-ink-muted"
              data-testid="lead-time-preview"
            >
              {leadPreview === "Invalid"
                ? "Invalid"
                : `Notifies: ${leadPreview}`}
            </p>
          )}
        </OptionalField>

        <button
          type="submit"
          disabled={submitDisabled}
          className="rounded-lg p-4 bg-accent text-on-accent text-base font-semibold min-h-[52px] hover:bg-accent/90 active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none"
        >
          {submitLabel}
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg p-3 text-ink-muted text-base font-medium active:opacity-60 transition-opacity cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
