import 'fake-indexeddb/auto'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '../db'
import { createTimer } from '../hooks/useTimers'
import * as useTimersMod from '../hooks/useTimers'
import { EditTimerView } from '../components/EditTimerView'
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

async function getTimer(id: number | undefined): Promise<Timer> {
  const timer = id === undefined ? undefined : await db.timers.get(id)
  if (!timer) throw new Error(`timer ${id} not found`)
  return timer
}

beforeEach(async () => {
  await db.timers.clear()
  useToastStore.setState({ toasts: [] })
})

afterEach(() => {
  vi.restoreAllMocks()
})
describe('EditTimerView — edit mode', () => {
  it('hides time inputs and shows a read-only snapshot by default', async () => {
    const id = await createTimer(BASE, null)
    const existing = await getTimer(id)

    render(<EditTimerView existing={existing} onDone={() => {}} userId={null} getNow={getNow} />)

    expect(screen.queryByRole('button', { name: /from now/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /at time/i })).not.toBeInTheDocument()
    expect(screen.getByText(/edit time/i)).toBeInTheDocument()
  })

  describe('when time edit is unlocked', () => {
    beforeEach(async () => {
      const id = await createTimer(BASE, null)
      const existing = await getTimer(id)
      render(<EditTimerView existing={existing} onDone={() => {}} userId={null} getNow={getNow} />)
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
    const existing = await getTimer(id)

    render(<EditTimerView existing={existing} onDone={() => {}} userId={null} getNow={getNow} />)

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
    const existing = await getTimer(id)

    render(<EditTimerView existing={existing} onDone={() => {}} userId={null} getNow={getNow} />)

    fireEvent.click(screen.getByText(/edit time/i))
    fireEvent.click(screen.getByRole('button', { name: /update timer/i }))

    await waitFor(() => {
      expect(useToastStore.getState().toasts).toHaveLength(1)
      expect(useToastStore.getState().toasts[0].variant).toBe('error')
    })
  })
})
describe('EditTimerView — timerType checkbox', () => {
  it('existing task timer renders checkbox pre-checked', async () => {
    const id = await createTimer({ ...BASE, timerType: TimerType.Task }, null)
    const existing = await getTimer(id)

    render(<EditTimerView existing={existing} onDone={() => {}} userId={null} getNow={getNow} />)

    expect(screen.getByRole('checkbox', { name: /task/i })).toBeChecked()
  })

  it('unchecking Task and saving stores timerType reminder', async () => {
    const id = await createTimer({ ...BASE, timerType: TimerType.Task }, null)
    const existing = await getTimer(id)

    render(<EditTimerView existing={existing} onDone={() => {}} userId={null} getNow={getNow} />)

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
describe('EditTimerView — leadTimeMs', () => {
  it('existing lead time is reflected in the DurationPicker dial display', async () => {
    const futureTarget = new Date(Date.now() + 30 * 60 * 1000) // 30 min from now
    const id = await createTimer({ ...BASE, targetDatetime: futureTarget, leadTimeMs: 15 * 60 * 1000 }, null)
    const existing = await getTimer(id)

    render(<EditTimerView existing={existing} onDone={() => {}} userId={null} getNow={getNow} />)

    // msToDuration(900000) = { days: 0, hours: 0, minutes: 15 }
    // interval mode: isPm=false, hourDisplay=0, minuteDisplay='15'
    expect(within(leadTimeFields()).getByTestId('dial-minute')).toHaveTextContent('15')
  })

  it('stores lead time from days slider', async () => {
    const futureTarget = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 days from now
    const id = await createTimer({ ...BASE, targetDatetime: futureTarget }, null)
    const existing = await getTimer(id)

    render(<EditTimerView existing={existing} onDone={() => {}} userId={null} getNow={getNow} />)
    fireEvent.click(screen.getByRole('button', { name: /set time/i }))
    fireEvent.change(within(leadTimeFields()).getByRole('slider', { name: /days/i }), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: /update timer/i }))

    await waitFor(async () => {
      const timer = await db.timers.get(id!)
      expect(timer?.leadTimeMs).toBe(2 * 86_400_000)
    })
  })

  it('lead time slider maxDays matches days until target when target is days away', async () => {
    // Use 2.5 days from NOW so daysUntilTarget=2 (buffer = 12h)
    const futureTarget = new Date(NOW + 2 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000)
    const id = await createTimer({ ...BASE, targetDatetime: futureTarget }, null)
    const existing = await getTimer(id)

    render(<EditTimerView existing={existing} onDone={() => {}} userId={null} getNow={getNow} />)
    fireEvent.click(screen.getByRole('button', { name: /set time/i }))

    expect(within(leadTimeFields()).getByRole('slider', { name: /days/i })).toHaveAttribute('max', '2')
  })

  it('lead time DurationPicker is always shown with dial and slider regardless of remaining time', async () => {
    const futureTarget = new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours from now
    const id = await createTimer({ ...BASE, targetDatetime: futureTarget }, null)
    const existing = await getTimer(id)

    render(<EditTimerView existing={existing} onDone={() => {}} userId={null} getNow={getNow} />)
    fireEvent.click(screen.getByRole('button', { name: /set time/i }))

    const fields = leadTimeFields()
    expect(within(fields).getByTestId('dial-face')).toBeInTheDocument()
    expect(within(fields).getByRole('slider', { name: /days/i })).toBeInTheDocument()
  })

  it('removing lead time stores null', async () => {
    const id = await createTimer({ ...BASE, leadTimeMs: 900000 }, null)
    const existing = await getTimer(id)

    render(<EditTimerView existing={existing} onDone={() => {}} userId={null} getNow={getNow} />)

    fireEvent.click(screen.getByRole('button', { name: /cancel reminder/i }))
    fireEvent.click(screen.getByRole('button', { name: /update timer/i }))

    await waitFor(async () => {
      const timer = await db.timers.get(id!)
      expect(timer?.leadTimeMs).toBeNull()
    })
  })
})
describe('EditTimerView — lead time notification preview', () => {
  it('preview shows "Invalid" when the notification time would fall in the past', async () => {
    // Use an expired timer: with any lead time, notifyMs ≤ now → "Invalid"
    const pastTarget = new Date(NOW - 60 * 1000) // expired 1 min ago relative to injected getNow
    const id = await createTimer({ ...BASE, targetDatetime: pastTarget }, null)
    const existing = await getTimer(id)

    render(<EditTimerView existing={existing} onDone={() => {}} userId={null} getNow={getNow} />)
    // Activate lead time (leadTimeMs=0); notifyMs = pastTarget → in the past → "Invalid"
    fireEvent.click(screen.getByRole('button', { name: /set time/i }))

    expect(screen.getByTestId('lead-time-preview').textContent).toBe('Invalid')
  })
})
describe('EditTimerView — Recurring mode', () => {
  it('editing a timer with recurrenceRule opens in Recurring mode after unlocking', async () => {
    const id = await createTimer(
      { ...BASE, recurrenceRule: { cron: '0 9 * * *', tz: 'UTC' } },
      'user-1',
    )
    const existing = await getTimer(id)
    render(<EditTimerView existing={existing} onDone={() => {}} userId="user-1" getNow={getNow} />)
    fireEvent.click(screen.getByRole('button', { name: /edit time/i }))
    expect(screen.getByRole('combobox', { name: /schedule/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /schedule/i })).toHaveValue('daily')
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
    const existing = await getTimer(id)
    render(<EditTimerView existing={existing} onDone={() => {}} userId="user-1" getNow={getNow} />)

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
    const existing = await getTimer(id)
    render(<EditTimerView existing={existing} onDone={() => {}} userId="user-1" getNow={getNow} />)

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
      return getTimer(id)
    }

    it('switching to "At time" clears recurrenceRule on save', async () => {
      const existing = await createRecurringTimer()
      render(<EditTimerView existing={existing} onDone={() => {}} userId="user-1" getNow={getNow} />)

      fireEvent.click(screen.getByRole('button', { name: /edit time/i }))
      fireEvent.click(screen.getByRole('button', { name: /at time/i }))
      fireEvent.click(screen.getByRole('button', { name: /update timer/i }))

      await waitFor(async () => {
        const timer = await db.timers.get(existing.id)
        expect(timer?.recurrenceRule).toBeNull()
      })
    })

    it('switching to "From now" clears recurrenceRule on save', async () => {
      const existing = await createRecurringTimer()
      render(<EditTimerView existing={existing} onDone={() => {}} userId="user-1" getNow={getNow} />)

      fireEvent.click(screen.getByRole('button', { name: /edit time/i }))
      fireEvent.click(screen.getByRole('button', { name: /from now/i }))
      fireEvent.click(screen.getByRole('button', { name: /update timer/i }))

      await waitFor(async () => {
        const timer = await db.timers.get(existing.id)
        expect(timer?.recurrenceRule).toBeNull()
      })
    })

    it('staying in Recurring mode preserves recurrenceRule on save', async () => {
      const existing = await createRecurringTimer()
      render(<EditTimerView existing={existing} onDone={() => {}} userId="user-1" getNow={getNow} />)

      fireEvent.click(screen.getByRole('button', { name: /update timer/i }))

      await waitFor(async () => {
        const timer = await db.timers.get(existing.id)
        expect(timer?.recurrenceRule).not.toBeNull()
        expect(timer?.recurrenceRule?.cron).toMatch(/\d+ \d+ \* \* \*/)
      })
    })
  })
})
