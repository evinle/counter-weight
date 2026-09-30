import 'fake-indexeddb/auto'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '../db'
import { CreateTimerView } from '../components/CreateTimerView'
import { useToastStore } from '../hooks/useToast'
import { TimerType } from '../db/schema'

// Fixed "now" used across tests — must be before BASE.targetDatetime so the submit button is enabled
const NOW = new Date('2026-05-01T12:00:00Z').getTime()
const getNow = () => NOW

beforeEach(async () => {
  await db.timers.clear()
  useToastStore.setState({ toasts: [] })
})

afterEach(() => {
  vi.restoreAllMocks()
})
describe('CreateTimerView — create mode', () => {
  it('shows time inputs immediately without an Edit time button', () => {
    render(<CreateTimerView onDone={() => {}} userId={null} getNow={getNow} />)

    expect(screen.getByRole('button', { name: /from now/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /at time/i })).toBeInTheDocument()
    expect(screen.queryByText(/edit time/i)).not.toBeInTheDocument()
  })
})
describe('CreateTimerView — timerType checkbox', () => {
  it('checkbox is unchecked by default, saving stores timerType reminder', async () => {
    render(<CreateTimerView onDone={() => {}} userId={null} getNow={getNow} />)

    expect(screen.getByRole('checkbox', { name: /task/i })).not.toBeChecked()

    fireEvent.change(screen.getByPlaceholderText(/what are you timing/i), { target: { value: 'Test' } })
    fireEvent.click(screen.getByRole('button', { name: /create timer/i }))

    await waitFor(async () => {
      const timers = await db.timers.toArray()
      expect(timers[0].timerType).toBe(TimerType.Reminder)
    })
  })

  it('checking the Task checkbox saves timerType task', async () => {
    render(<CreateTimerView onDone={() => {}} userId={null} getNow={getNow} />)

    fireEvent.change(screen.getByPlaceholderText(/what are you timing/i), { target: { value: 'Test' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /task/i }))
    fireEvent.click(screen.getByRole('button', { name: /create timer/i }))

    await waitFor(async () => {
      const timers = await db.timers.toArray()
      expect(timers[0].timerType).toBe(TimerType.Task)
    })
  })

})
function leadTimeFields() {
  return screen.getByTestId('lead-time-fields')
}
describe('CreateTimerView — leadTimeMs', () => {
  it('lead time field is hidden by default, stores null on submit', async () => {
    render(<CreateTimerView onDone={() => {}} userId={null} getNow={getNow} />)

    expect(screen.queryByRole('textbox', { name: /^minutes$/i })).not.toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText(/what are you timing/i), { target: { value: 'Test' } })
    fireEvent.click(screen.getByRole('button', { name: /create timer/i }))

    await waitFor(async () => {
      const timers = await db.timers.toArray()
      expect(timers[0].leadTimeMs).toBeNull()
    })
  })

  it('clicking Set time reveals the DurationPicker', () => {
    render(<CreateTimerView onDone={() => {}} userId={null} getNow={getNow} />)

    fireEvent.click(screen.getByRole('button', { name: /set time/i }))

    const fields = leadTimeFields()
    expect(within(fields).getByTestId('dial-face')).toBeInTheDocument()
    expect(within(fields).getByRole('slider', { name: /days/i })).toBeInTheDocument()
  })

  it('adding a lead time via days slider stores it as milliseconds', async () => {
    render(<CreateTimerView onDone={() => {}} userId={null} getNow={getNow} />)

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

  it('lead time slider maxDays tracks the main duration when in FromNow mode', () => {
    render(<CreateTimerView onDone={() => {}} userId={null} getNow={getNow} />)
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
    render(<CreateTimerView onDone={() => {}} userId={null} getNow={getNow} />)

    fireEvent.click(screen.getByRole('button', { name: /set time/i }))

    expect(within(leadTimeFields()).getByRole('slider', { name: /days/i })).toHaveValue('0')
  })

  it('lead time DurationPicker maxDays is 0 when remaining time is less than one day', () => {
    render(<CreateTimerView onDone={() => {}} userId={null} getNow={getNow} />)
    // Default AtTime target is ~1h from now → daysUntilTarget = 0
    fireEvent.click(screen.getByRole('button', { name: /set time/i }))

    expect(within(leadTimeFields()).getByRole('slider', { name: /days/i })).toHaveAttribute('max', '0')
  })

})
describe('CreateTimerView — lead time notification preview', () => {
  it('preview is absent when lead time is not active', () => {
    render(<CreateTimerView onDone={() => {}} userId={null} getNow={getNow} />)
    expect(screen.queryByTestId('lead-time-preview')).not.toBeInTheDocument()
  })

  it('preview shows "Notifies: DD/MM/YYYY HH:MM" when lead is set and target is in the future', () => {
    render(<CreateTimerView onDone={() => {}} userId={null} getNow={getNow} />)

    // Default mode is AtTime with target ~1h from now.
    // Clicking "Set time" activates lead time with 0ms — notification falls at target time itself,
    // which is in the future, so the preview shows "Notifies: ...".
    fireEvent.click(screen.getByRole('button', { name: /at time/i }))
    fireEvent.click(screen.getByRole('button', { name: /set time/i }))

    const preview = screen.getByTestId('lead-time-preview')
    expect(preview.textContent).toMatch(/^Notifies: \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)
  })

})
describe('CreateTimerView — Recurring mode', () => {
  it('Recurring tab is absent for guest users', () => {
    render(<CreateTimerView onDone={() => {}} userId={null} getNow={getNow} />)
    expect(screen.queryByRole('button', { name: /recurring/i })).not.toBeInTheDocument()
  })

  it('Recurring tab is present for logged-in users', () => {
    render(<CreateTimerView onDone={() => {}} userId="user-1" getNow={getNow} />)
    expect(screen.getByRole('button', { name: /recurring/i })).toBeInTheDocument()
  })

  it('AtTime mode has no recurrence affordance', () => {
    render(<CreateTimerView onDone={() => {}} userId="user-1" getNow={getNow} />)
    fireEvent.click(screen.getByRole('button', { name: /at time/i }))
    expect(screen.queryByRole('button', { name: /set recurrence/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /schedule/i })).not.toBeInTheDocument()
  })

  it('clicking Recurring tab shows Schedule picker directly (no OptionalField)', () => {
    render(<CreateTimerView onDone={() => {}} userId="user-1" getNow={getNow} />)
    fireEvent.click(screen.getByRole('button', { name: /recurring/i }))
    expect(screen.getByRole('combobox', { name: /schedule/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /set recurrence/i })).not.toBeInTheDocument()
  })

  it('submitting Recurring mode stores recurrenceRule with cron and tz', async () => {
    render(<CreateTimerView onDone={() => {}} userId="user-1" getNow={getNow} />)
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
    render(<CreateTimerView onDone={() => {}} userId="user-1" getNow={getNow} />)
    fireEvent.change(screen.getByPlaceholderText(/what are you timing/i), { target: { value: 'Daily standup' } })
    fireEvent.click(screen.getByRole('button', { name: /recurring/i }))
    fireEvent.click(screen.getByRole('button', { name: /create timer/i }))

    await waitFor(async () => {
      const timers = await db.timers.toArray()
      expect(timers[0].targetDatetime.getTime()).toBeGreaterThan(Date.now() - 1000)
    })
  })

  it('switching days in Recurring mode and submitting stores custom-weekly cron', async () => {
    render(<CreateTimerView onDone={() => {}} userId="user-1" getNow={getNow} />)
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

})
