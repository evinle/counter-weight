import 'fake-indexeddb/auto'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '../db'
import { createTimer } from '../hooks/useTimers'
import * as useTimersMod from '../hooks/useTimers'
import { CreateEditView, computeLeadTimeVisibility } from '../components/CreateEditView'
import { useToastStore } from '../hooks/useToast'
import { TimerType } from '../db/schema'
import type { Timer } from '../db/schema'
import * as recurrenceMod from '@cw/recurrence'

// Fixed "now" used across tests — must be before BASE.targetDatetime so the submit button is enabled
const NOW = new Date('2026-05-01T12:00:00Z').getTime()
const getNow = () => NOW

const BASE = {
  title: 'Test Timer',
  description: null,
  emoji: null,
  targetDatetime: new Date('2026-06-01T12:00:00Z'),
  status: 'active',
  priority: 'medium',
  recurrenceRule: null,
  tagIds: [],
  timerType: TimerType.Reminder,
  leadTimeMs: null,
  workSessions: [],
} satisfies Omit<Timer, 'id' | 'createdAt' | 'updatedAt' | 'originalTargetDatetime' | 'serverId' | 'userId' | 'syncStatus' | 'version'>

beforeEach(async () => {
  await db.timers.clear()
  useToastStore.setState({ toasts: [] })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CreateEditView — edit mode', () => {
  it('hides time inputs and shows a read-only snapshot by default', async () => {
    const id = await createTimer(BASE, null)
    const existing = await db.timers.get(id!)

    render(<CreateEditView existing={existing} onDone={() => {}} userId={null} getNow={getNow} />)

    expect(screen.queryByRole('button', { name: /from now/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /at time/i })).not.toBeInTheDocument()
    expect(screen.getByText(/edit time/i)).toBeInTheDocument()
  })

  describe('when time edit is unlocked', () => {
    beforeEach(async () => {
      const id = await createTimer(BASE, null)
      const existing = await db.timers.get(id!)
      render(<CreateEditView existing={existing} onDone={() => {}} userId={null} getNow={getNow} />)
      fireEvent.click(screen.getByText(/edit time/i))
    })

    it('shows the mode toggle and duration inputs', () => {
      expect(screen.getByRole('button', { name: /from now/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /at time/i })).toBeInTheDocument()
    })

    it('returns to locked state after cancel', () => {
      fireEvent.click(screen.getByText(/cancel time edit/i))

      expect(screen.queryByRole('button', { name: /from now/i })).not.toBeInTheDocument()
      expect(screen.getByText(/edit time/i)).toBeInTheDocument()
    })
  })

  it('preserves targetDatetime in Dexie when submitting without unlocking time', async () => {
    const id = await createTimer(BASE, null)
    const existing = await db.timers.get(id!)

    render(<CreateEditView existing={existing} onDone={() => {}} userId={null} getNow={getNow} />)

    fireEvent.change(screen.getByPlaceholderText(/what are you timing/i), {
      target: { value: 'Retitled' },
    })
    fireEvent.click(screen.getByRole('button', { name: /update timer/i }))

    await waitFor(async () => {
      const timer = await db.timers.get(id!)
      expect(timer?.title).toBe('Retitled')
      expect(timer?.targetDatetime.getTime()).toBe(BASE.targetDatetime.getTime())
    })
  })

  it('shows an error toast when a second extension is blocked', async () => {
    // Spy on editTimer to return false — the "second extension blocked" path.
    // The guard logic itself is covered in useTimers.test.ts; this test only
    // verifies the component's UI response (show toast, don't close the form).
    vi.spyOn(useTimersMod, 'editTimer').mockResolvedValueOnce(false)

    const id = await createTimer(BASE, null)
    const existing = await db.timers.get(id!)

    render(<CreateEditView existing={existing} onDone={() => {}} userId={null} getNow={getNow} />)

    fireEvent.click(screen.getByText(/edit time/i))
    fireEvent.click(screen.getByRole('button', { name: /update timer/i }))

    await waitFor(() => {
      expect(useToastStore.getState().toasts).toHaveLength(1)
      expect(useToastStore.getState().toasts[0].variant).toBe('error')
    })
  })
})

describe('CreateEditView — create mode', () => {
  it('shows time inputs immediately without an Edit time button', () => {
    render(<CreateEditView onDone={() => {}} userId={null} getNow={getNow} />)

    expect(screen.getByRole('button', { name: /from now/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /at time/i })).toBeInTheDocument()
    expect(screen.queryByText(/edit time/i)).not.toBeInTheDocument()
  })
})

describe('CreateEditView — timerType checkbox', () => {
  it('checkbox is unchecked by default, saving stores timerType reminder', async () => {
    render(<CreateEditView onDone={() => {}} userId={null} getNow={getNow} />)

    expect(screen.getByRole('checkbox', { name: /task/i })).not.toBeChecked()

    fireEvent.change(screen.getByPlaceholderText(/what are you timing/i), { target: { value: 'Test' } })
    fireEvent.click(screen.getByRole('button', { name: /create timer/i }))

    await waitFor(async () => {
      const timers = await db.timers.toArray()
      expect(timers[0].timerType).toBe(TimerType.Reminder)
    })
  })

  it('checking the Task checkbox saves timerType task', async () => {
    render(<CreateEditView onDone={() => {}} userId={null} getNow={getNow} />)

    fireEvent.change(screen.getByPlaceholderText(/what are you timing/i), { target: { value: 'Test' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /task/i }))
    fireEvent.click(screen.getByRole('button', { name: /create timer/i }))

    await waitFor(async () => {
      const timers = await db.timers.toArray()
      expect(timers[0].timerType).toBe(TimerType.Task)
    })
  })

  it('existing task timer renders checkbox pre-checked', async () => {
    const id = await createTimer({ ...BASE, timerType: TimerType.Task }, null)
    const existing = await db.timers.get(id!)

    render(<CreateEditView existing={existing} onDone={() => {}} userId={null} getNow={getNow} />)

    expect(screen.getByRole('checkbox', { name: /task/i })).toBeChecked()
  })

  it('unchecking Task and saving stores timerType reminder', async () => {
    const id = await createTimer({ ...BASE, timerType: TimerType.Task }, null)
    const existing = await db.timers.get(id!)

    render(<CreateEditView existing={existing} onDone={() => {}} userId={null} getNow={getNow} />)

    fireEvent.click(screen.getByRole('checkbox', { name: /task/i }))
    fireEvent.click(screen.getByRole('button', { name: /update timer/i }))

    await waitFor(async () => {
      const timer = await db.timers.get(id!)
      expect(timer?.timerType).toBe(TimerType.Reminder)
    })
  })
})

function leadTimeFields() {
  return screen.getByTestId('lead-time-fields')
}

describe('CreateEditView — leadTimeMs', () => {
  it('lead time field is hidden by default, stores null on submit', async () => {
    render(<CreateEditView onDone={() => {}} userId={null} getNow={getNow} />)

    expect(screen.queryByRole('textbox', { name: /^minutes$/i })).not.toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText(/what are you timing/i), { target: { value: 'Test' } })
    fireEvent.click(screen.getByRole('button', { name: /create timer/i }))

    await waitFor(async () => {
      const timers = await db.timers.toArray()
      expect(timers[0].leadTimeMs).toBeNull()
    })
  })

  it('clicking Set time reveals the DurationPicker', () => {
    render(<CreateEditView onDone={() => {}} userId={null} getNow={getNow} />)

    fireEvent.click(screen.getByRole('button', { name: /set time/i }))

    const fields = leadTimeFields()
    expect(within(fields).getByTestId('dial-face')).toBeInTheDocument()
    expect(within(fields).getByRole('slider', { name: /days/i })).toBeInTheDocument()
  })

  it('adding a lead time via days slider stores it as milliseconds', async () => {
    render(<CreateEditView onDone={() => {}} userId={null} getNow={getNow} />)

    fireEvent.change(screen.getByPlaceholderText(/what are you timing/i), { target: { value: 'Test' } })
    // Switch to FromNow and set a 2-day duration first so the lead time slider allows days >= 1
    fireEvent.click(screen.getByRole('button', { name: /from now/i }))
    fireEvent.change(screen.getByRole('slider', { name: /days/i }), { target: { value: '2' } })
    // Activate lead time — daysUntilTarget=2 so the lead time slider max is 2
    fireEvent.click(screen.getByRole('button', { name: /set time/i }))
    fireEvent.change(within(leadTimeFields()).getByRole('slider', { name: /days/i }), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: /create timer/i }))

    await waitFor(async () => {
      const timers = await db.timers.toArray()
      expect(timers[0].leadTimeMs).toBe(86_400_000)
    })
  })

  it('existing lead time is reflected in the DurationPicker dial display', async () => {
    const futureTarget = new Date(Date.now() + 30 * 60 * 1000) // 30 min from now
    const id = await createTimer({ ...BASE, targetDatetime: futureTarget, leadTimeMs: 15 * 60 * 1000 }, null)
    const existing = await db.timers.get(id!)

    render(<CreateEditView existing={existing} onDone={() => {}} userId={null} getNow={getNow} />)

    // msToDuration(900000) = { days: 0, hours: 0, minutes: 15 }
    // interval mode: isPm=false, hourDisplay=0, minuteDisplay='15'
    expect(within(leadTimeFields()).getByTestId('dial-minute')).toHaveTextContent('15')
  })

  it('stores lead time from days slider', async () => {
    const futureTarget = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 days from now
    const id = await createTimer({ ...BASE, targetDatetime: futureTarget }, null)
    const existing = await db.timers.get(id!)

    render(<CreateEditView existing={existing} onDone={() => {}} userId={null} getNow={getNow} />)
    fireEvent.click(screen.getByRole('button', { name: /set time/i }))
    fireEvent.change(within(leadTimeFields()).getByRole('slider', { name: /days/i }), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: /update timer/i }))

    await waitFor(async () => {
      const timer = await db.timers.get(id!)
      expect(timer?.leadTimeMs).toBe(2 * 86_400_000)
    })
  })

  it('lead time slider maxDays tracks the main duration when in FromNow mode', () => {
    render(<CreateEditView onDone={() => {}} userId={null} getNow={getNow} />)
    fireEvent.click(screen.getByRole('button', { name: /from now/i }))
    // Default 5 min duration → daysUntilTarget = 0
    fireEvent.click(screen.getByRole('button', { name: /set time/i }))

    const fields = leadTimeFields()
    expect(within(fields).getByRole('slider', { name: /days/i })).toHaveAttribute('max', '0')

    // Change main duration to 2 days via the slider outside the lead-time-fields area
    const allSliders = screen.getAllByRole('slider', { name: /days/i })
    const mainSlider = allSliders.find(s => !fields.contains(s))!
    fireEvent.change(mainSlider, { target: { value: '2' } })

    // daysUntilTarget should now be 2
    expect(within(fields).getByRole('slider', { name: /days/i })).toHaveAttribute('max', '2')
  })

  it('lead time DurationPicker days slider starts at 0 after activation', () => {
    render(<CreateEditView onDone={() => {}} userId={null} getNow={getNow} />)

    fireEvent.click(screen.getByRole('button', { name: /set time/i }))

    expect(within(leadTimeFields()).getByRole('slider', { name: /days/i })).toHaveValue('0')
  })

  it('lead time slider maxDays matches days until target when target is days away', async () => {
    // Use 2.5 days from NOW so daysUntilTarget=2 (buffer = 12h)
    const futureTarget = new Date(NOW + 2 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000)
    const id = await createTimer({ ...BASE, targetDatetime: futureTarget }, null)
    const existing = await db.timers.get(id!)

    render(<CreateEditView existing={existing} onDone={() => {}} userId={null} getNow={getNow} />)
    fireEvent.click(screen.getByRole('button', { name: /set time/i }))

    expect(within(leadTimeFields()).getByRole('slider', { name: /days/i })).toHaveAttribute('max', '2')
  })

  it('lead time DurationPicker is always shown with dial and slider regardless of remaining time', async () => {
    const futureTarget = new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours from now
    const id = await createTimer({ ...BASE, targetDatetime: futureTarget }, null)
    const existing = await db.timers.get(id!)

    render(<CreateEditView existing={existing} onDone={() => {}} userId={null} getNow={getNow} />)
    fireEvent.click(screen.getByRole('button', { name: /set time/i }))

    const fields = leadTimeFields()
    expect(within(fields).getByTestId('dial-face')).toBeInTheDocument()
    expect(within(fields).getByRole('slider', { name: /days/i })).toBeInTheDocument()
  })

  it('lead time DurationPicker maxDays is 0 when remaining time is less than one day', () => {
    render(<CreateEditView onDone={() => {}} userId={null} getNow={getNow} />)
    // Default AtTime target is ~1h from now → daysUntilTarget = 0
    fireEvent.click(screen.getByRole('button', { name: /set time/i }))

    expect(within(leadTimeFields()).getByRole('slider', { name: /days/i })).toHaveAttribute('max', '0')
  })

  it('removing lead time stores null', async () => {
    const id = await createTimer({ ...BASE, leadTimeMs: 900000 }, null)
    const existing = await db.timers.get(id!)

    render(<CreateEditView existing={existing} onDone={() => {}} userId={null} getNow={getNow} />)

    fireEvent.click(screen.getByRole('button', { name: /cancel reminder/i }))
    fireEvent.click(screen.getByRole('button', { name: /update timer/i }))

    await waitFor(async () => {
      const timer = await db.timers.get(id!)
      expect(timer?.leadTimeMs).toBeNull()
    })
  })
})

describe('CreateEditView — lead time notification preview', () => {
  it('preview is absent when lead time is not active', () => {
    render(<CreateEditView onDone={() => {}} userId={null} getNow={getNow} />)
    expect(screen.queryByTestId('lead-time-preview')).not.toBeInTheDocument()
  })

  it('preview shows "Notifies: DD/MM/YYYY HH:MM" when lead is set and target is in the future', () => {
    render(<CreateEditView onDone={() => {}} userId={null} getNow={getNow} />)

    // Default mode is AtTime with target ~1h from now.
    // Clicking "Set time" activates lead time with 0ms — notification falls at target time itself,
    // which is in the future, so the preview shows "Notifies: ...".
    fireEvent.click(screen.getByRole('button', { name: /at time/i }))
    fireEvent.click(screen.getByRole('button', { name: /set time/i }))

    const preview = screen.getByTestId('lead-time-preview')
    expect(preview.textContent).toMatch(/^Notifies: \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)
  })

  it('preview shows "Invalid" when the notification time would fall in the past', async () => {
    // Use an expired timer: with any lead time, notifyMs ≤ now → "Invalid"
    const pastTarget = new Date(NOW - 60 * 1000) // expired 1 min ago relative to injected getNow
    const id = await createTimer({ ...BASE, targetDatetime: pastTarget }, null)
    const existing = await db.timers.get(id!)

    render(<CreateEditView existing={existing} onDone={() => {}} userId={null} getNow={getNow} />)
    // Activate lead time (leadTimeMs=0); notifyMs = pastTarget → in the past → "Invalid"
    fireEvent.click(screen.getByRole('button', { name: /set time/i }))

    expect(screen.getByTestId('lead-time-preview').textContent).toBe('Invalid')
  })
})

describe('computeLeadTimeVisibility', () => {
  const DAY_MS = 86_400_000

  it('FromNow mode: uses remainingMs — short remaining hides Days and Hours', () => {
    const result = computeLeadTimeVisibility('from-now', 5 * 60 * 1000, null)
    expect(result).toStrictEqual({ showDays: false, showHours: false, showMinutes: true })
  })

  it('FromNow mode: uses remainingMs — 2-hour remaining shows Hours', () => {
    const result = computeLeadTimeVisibility('from-now', 2 * 60 * 60 * 1000, null)
    expect(result).toStrictEqual({ showDays: false, showHours: true, showMinutes: true })
  })

  it('FromNow mode: uses remainingMs — 2-day remaining shows Days', () => {
    const result = computeLeadTimeVisibility('from-now', 2 * DAY_MS, null)
    expect(result).toStrictEqual({ showDays: true, showHours: true, showMinutes: true })
  })

  it('Recurrence mode with no rule: falls back to remainingMs', () => {
    const result = computeLeadTimeVisibility('recurrence', 5 * 60 * 1000, null)
    expect(result).toStrictEqual({ showDays: false, showHours: false, showMinutes: true })
  })

  it('Recurrence mode with daily rule: uses period (1 day) regardless of short remainingMs', () => {
    vi.spyOn(recurrenceMod, 'computePeriodMs').mockReturnValue(DAY_MS)
    const rule = { cron: '0 9 * * *', tz: 'UTC' } satisfies { cron: string; tz: string }
    // remainingMs is only 3 hours — without period logic, Days would be hidden
    const result = computeLeadTimeVisibility('recurrence', 3 * 60 * 60 * 1000, rule)
    expect(result).toStrictEqual({ showDays: true, showHours: true, showMinutes: true })
    vi.restoreAllMocks()
  })
})

describe('CreateEditView — Recurring mode', () => {
  it('Recurring tab is absent for guest users', () => {
    render(<CreateEditView onDone={() => {}} userId={null} getNow={getNow} />)
    expect(screen.queryByRole('button', { name: /recurring/i })).not.toBeInTheDocument()
  })

  it('Recurring tab is present for logged-in users', () => {
    render(<CreateEditView onDone={() => {}} userId="user-1" getNow={getNow} />)
    expect(screen.getByRole('button', { name: /recurring/i })).toBeInTheDocument()
  })

  it('AtTime mode has no recurrence affordance', () => {
    render(<CreateEditView onDone={() => {}} userId="user-1" getNow={getNow} />)
    fireEvent.click(screen.getByRole('button', { name: /at time/i }))
    expect(screen.queryByRole('button', { name: /set recurrence/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /schedule/i })).not.toBeInTheDocument()
  })

  it('clicking Recurring tab shows Schedule picker directly (no OptionalField)', () => {
    render(<CreateEditView onDone={() => {}} userId="user-1" getNow={getNow} />)
    fireEvent.click(screen.getByRole('button', { name: /recurring/i }))
    expect(screen.getByRole('combobox', { name: /schedule/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /set recurrence/i })).not.toBeInTheDocument()
  })

  it('submitting Recurring mode stores recurrenceRule with cron and tz', async () => {
    render(<CreateEditView onDone={() => {}} userId="user-1" getNow={getNow} />)
    fireEvent.change(screen.getByPlaceholderText(/what are you timing/i), { target: { value: 'Daily standup' } })
    fireEvent.click(screen.getByRole('button', { name: /recurring/i }))
    // default is Every day — just submit
    fireEvent.click(screen.getByRole('button', { name: /create timer/i }))

    await waitFor(async () => {
      const timers = await db.timers.toArray()
      expect(timers[0].recurrenceRule).not.toBeNull()
      expect(timers[0].recurrenceRule?.cron).toMatch(/^\d+ \d+ \* \* \*$/)
      expect(typeof timers[0].recurrenceRule?.tz).toBe('string')
    })
  })

  it('submitting Recurring mode computes targetDatetime in the future', async () => {
    render(<CreateEditView onDone={() => {}} userId="user-1" getNow={getNow} />)
    fireEvent.change(screen.getByPlaceholderText(/what are you timing/i), { target: { value: 'Daily standup' } })
    fireEvent.click(screen.getByRole('button', { name: /recurring/i }))
    fireEvent.click(screen.getByRole('button', { name: /create timer/i }))

    await waitFor(async () => {
      const timers = await db.timers.toArray()
      expect(timers[0].targetDatetime.getTime()).toBeGreaterThan(Date.now() - 1000)
    })
  })

  it('editing a timer with recurrenceRule opens in Recurring mode after unlocking', async () => {
    const id = await createTimer(
      { ...BASE, recurrenceRule: { cron: '0 9 * * *', tz: 'UTC' } },
      'user-1',
    )
    const existing = await db.timers.get(id!)
    render(<CreateEditView existing={existing} onDone={() => {}} userId="user-1" getNow={getNow} />)
    fireEvent.click(screen.getByRole('button', { name: /edit time/i }))
    expect(screen.getByRole('combobox', { name: /schedule/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /schedule/i })).toHaveValue('daily')
  })

  it('switching days in Recurring mode and submitting stores custom-weekly cron', async () => {
    render(<CreateEditView onDone={() => {}} userId="user-1" getNow={getNow} />)
    fireEvent.change(screen.getByPlaceholderText(/what are you timing/i), { target: { value: 'Weekly' } })
    fireEvent.click(screen.getByRole('button', { name: /recurring/i }))
    fireEvent.change(screen.getByRole('combobox', { name: /schedule/i }), { target: { value: 'weekly' } })
    fireEvent.click(screen.getByRole('button', { name: /^mon$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^wed$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^fri$/i }))
    fireEvent.click(screen.getByRole('button', { name: /create timer/i }))

    await waitFor(async () => {
      const timers = await db.timers.toArray()
      expect(timers[0].recurrenceRule?.cron).toMatch(/\* \* \d(,\d)*$/)
    })
  })

  it('recurring daily timer lead time slider maxDays uses period (1 day) not next occurrence distance', async () => {
    // The period of a daily cron is 1 day; daysUntilTarget should use computePeriodMs,
    // giving maxDays=1 even when the next occurrence is only 3h away.
    vi.spyOn(recurrenceMod, 'computePeriodMs').mockReturnValue(86_400_000) // 1 day
    vi.spyOn(recurrenceMod, 'nextOccurrence').mockReturnValue(
      new Date(Date.now() + 3 * 60 * 60 * 1000),
    )

    const id = await createTimer(
      { ...BASE, recurrenceRule: { cron: '0 9 * * *', tz: 'UTC' } },
      'user-1',
    )
    const existing = await db.timers.get(id!)
    render(<CreateEditView existing={existing} onDone={() => {}} userId="user-1" getNow={getNow} />)

    fireEvent.click(screen.getByRole('button', { name: /set time/i }))

    expect(within(leadTimeFields()).getByRole('slider', { name: /days/i })).toHaveAttribute('max', '1')
  })

  it('recurring daily timer accepts a 1-day lead time without masking it away', async () => {
    vi.spyOn(recurrenceMod, 'computePeriodMs').mockReturnValue(86_400_000) // 1 day
    vi.spyOn(recurrenceMod, 'nextOccurrence').mockReturnValue(
      new Date(Date.now() + 3 * 60 * 60 * 1000),
    )

    const id = await createTimer(
      { ...BASE, recurrenceRule: { cron: '0 9 * * *', tz: 'UTC' } },
      'user-1',
    )
    const existing = await db.timers.get(id!)
    render(<CreateEditView existing={existing} onDone={() => {}} userId="user-1" getNow={getNow} />)

    fireEvent.click(screen.getByRole('button', { name: /set time/i }))

    fireEvent.change(within(leadTimeFields()).getByRole('slider', { name: /days/i }), {
      target: { value: '1' },
    })
    fireEvent.click(screen.getByRole('button', { name: /update timer/i }))

    await waitFor(async () => {
      const timer = await db.timers.get(id!)
      expect(timer?.leadTimeMs).toBe(86_400_000)
    })
  })

  describe('editing a recurring timer — mode switch wipes recurrenceRule', () => {
    async function createRecurringTimer() {
      const id = await createTimer(
        { ...BASE, recurrenceRule: { cron: '0 9 * * *', tz: 'UTC' } },
        'user-1',
      )
      return db.timers.get(id!)
    }

    it('switching to "At time" clears recurrenceRule on save', async () => {
      const existing = await createRecurringTimer()
      render(<CreateEditView existing={existing} onDone={() => {}} userId="user-1" getNow={getNow} />)

      fireEvent.click(screen.getByRole('button', { name: /edit time/i }))
      fireEvent.click(screen.getByRole('button', { name: /at time/i }))
      fireEvent.click(screen.getByRole('button', { name: /update timer/i }))

      await waitFor(async () => {
        const timer = await db.timers.get(existing!.id)
        expect(timer?.recurrenceRule).toBeNull()
      })
    })

    it('switching to "From now" clears recurrenceRule on save', async () => {
      const existing = await createRecurringTimer()
      render(<CreateEditView existing={existing} onDone={() => {}} userId="user-1" getNow={getNow} />)

      fireEvent.click(screen.getByRole('button', { name: /edit time/i }))
      fireEvent.click(screen.getByRole('button', { name: /from now/i }))
      fireEvent.click(screen.getByRole('button', { name: /update timer/i }))

      await waitFor(async () => {
        const timer = await db.timers.get(existing!.id)
        expect(timer?.recurrenceRule).toBeNull()
      })
    })

    it('staying in Recurring mode preserves recurrenceRule on save', async () => {
      const existing = await createRecurringTimer()
      render(<CreateEditView existing={existing} onDone={() => {}} userId="user-1" getNow={getNow} />)

      fireEvent.click(screen.getByRole('button', { name: /update timer/i }))

      await waitFor(async () => {
        const timer = await db.timers.get(existing!.id)
        expect(timer?.recurrenceRule).not.toBeNull()
        expect(timer?.recurrenceRule?.cron).toMatch(/\d+ \d+ \* \* \*/)
      })
    })
  })
})
