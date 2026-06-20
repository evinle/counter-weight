import 'fake-indexeddb/auto'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '../db'
import { createTimer } from '../hooks/useTimers'
import * as useTimersMod from '../hooks/useTimers'
import { CreateEditView } from '../components/CreateEditView'
import { useToastStore } from '../hooks/useToast'
import { TimerType } from '../db/schema'
import type { Timer } from '../db/schema'

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

    render(<CreateEditView existing={existing} onDone={() => {}} userId={null} />)

    expect(screen.queryByRole('button', { name: /from now/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /at time/i })).not.toBeInTheDocument()
    expect(screen.getByText(/edit time/i)).toBeInTheDocument()
  })

  describe('when time edit is unlocked', () => {
    beforeEach(async () => {
      const id = await createTimer(BASE, null)
      const existing = await db.timers.get(id!)
      render(<CreateEditView existing={existing} onDone={() => {}} userId={null} />)
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

    render(<CreateEditView existing={existing} onDone={() => {}} userId={null} />)

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

    render(<CreateEditView existing={existing} onDone={() => {}} userId={null} />)

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
    render(<CreateEditView onDone={() => {}} userId={null} />)

    expect(screen.getByRole('button', { name: /from now/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /at time/i })).toBeInTheDocument()
    expect(screen.queryByText(/edit time/i)).not.toBeInTheDocument()
  })
})

describe('CreateEditView — timerType checkbox', () => {
  it('checkbox is unchecked by default, saving stores timerType reminder', async () => {
    render(<CreateEditView onDone={() => {}} userId={null} />)

    expect(screen.getByRole('checkbox', { name: /task/i })).not.toBeChecked()

    fireEvent.change(screen.getByPlaceholderText(/what are you timing/i), { target: { value: 'Test' } })
    fireEvent.click(screen.getByRole('button', { name: /create timer/i }))

    await waitFor(async () => {
      const timers = await db.timers.toArray()
      expect(timers[0].timerType).toBe(TimerType.Reminder)
    })
  })

  it('checking the Task checkbox saves timerType task', async () => {
    render(<CreateEditView onDone={() => {}} userId={null} />)

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

    render(<CreateEditView existing={existing} onDone={() => {}} userId={null} />)

    expect(screen.getByRole('checkbox', { name: /task/i })).toBeChecked()
  })

  it('unchecking Task and saving stores timerType reminder', async () => {
    const id = await createTimer({ ...BASE, timerType: TimerType.Task }, null)
    const existing = await db.timers.get(id!)

    render(<CreateEditView existing={existing} onDone={() => {}} userId={null} />)

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
    render(<CreateEditView onDone={() => {}} userId={null} />)

    expect(screen.queryByRole('textbox', { name: /^minutes$/i })).not.toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText(/what are you timing/i), { target: { value: 'Test' } })
    fireEvent.click(screen.getByRole('button', { name: /create timer/i }))

    await waitFor(async () => {
      const timers = await db.timers.toArray()
      expect(timers[0].leadTimeMs).toBeNull()
    })
  })

  it('clicking Set time reveals Minutes and Seconds spinners', () => {
    render(<CreateEditView onDone={() => {}} userId={null} />)

    fireEvent.click(screen.getByRole('button', { name: /set time/i }))

    expect(screen.getByRole('textbox', { name: /^minutes$/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /^seconds$/i })).toBeInTheDocument()
  })

  it('adding a lead time stores it as milliseconds', async () => {
    render(<CreateEditView onDone={() => {}} userId={null} />)

    fireEvent.change(screen.getByPlaceholderText(/what are you timing/i), { target: { value: 'Test' } })
    fireEvent.click(screen.getByRole('button', { name: /set time/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /^minutes$/i }), { target: { value: '10' } })
    fireEvent.change(screen.getByRole('textbox', { name: /^seconds$/i }), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: /create timer/i }))

    await waitFor(async () => {
      const timers = await db.timers.toArray()
      expect(timers[0].leadTimeMs).toBe((10 * 60 + 30) * 1000)
    })
  })

  it('existing lead time decomposes into minute and second spinners', async () => {
    const futureTarget = new Date(Date.now() + 30 * 60 * 1000) // 30 min from now — enough for Minutes to show
    const id = await createTimer({ ...BASE, targetDatetime: futureTarget, leadTimeMs: (15 * 60 + 45) * 1000 }, null)
    const existing = await db.timers.get(id!)

    render(<CreateEditView existing={existing} onDone={() => {}} userId={null} />)

    expect(screen.getByRole('textbox', { name: /^minutes$/i })).toHaveValue('15')
    expect(screen.getByRole('textbox', { name: /^seconds$/i })).toHaveValue('45')
  })

  it('stores lead time correctly across all four fields', async () => {
    const futureTarget = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 days from now
    const id = await createTimer({ ...BASE, targetDatetime: futureTarget }, null)
    const existing = await db.timers.get(id!)

    render(<CreateEditView existing={existing} onDone={() => {}} userId={null} />)
    fireEvent.click(screen.getByRole('button', { name: /set time/i }))

    const fields = leadTimeFields()
    fireEvent.change(within(fields).getByRole('textbox', { name: /^days$/i }), { target: { value: '1' } })
    fireEvent.change(within(fields).getByRole('textbox', { name: /^hours$/i }), { target: { value: '2' } })
    fireEvent.change(within(fields).getByRole('textbox', { name: /^minutes$/i }), { target: { value: '30' } })
    fireEvent.change(within(fields).getByRole('textbox', { name: /^seconds$/i }), { target: { value: '15' } })
    fireEvent.click(screen.getByRole('button', { name: /update timer/i }))

    const expectedMs = (1 * 86400 + 2 * 3600 + 30 * 60 + 15) * 1000
    await waitFor(async () => {
      const timer = await db.timers.get(id!)
      expect(timer?.leadTimeMs).toBe(expectedMs)
    })
  })

  it('updates visible lead time columns when duration is changed', () => {
    render(<CreateEditView onDone={() => {}} userId={null} />)
    // Default 5 min duration — lead time shows Minutes + Seconds, not Hours
    fireEvent.click(screen.getByRole('button', { name: /set time/i }))

    const fields = leadTimeFields()
    expect(within(fields).queryByRole('textbox', { name: /^hours$/i })).not.toBeInTheDocument()

    // Change DurationInput Hours to 2 (the only "Hours" spinner at this point)
    fireEvent.change(screen.getByRole('textbox', { name: /^hours$/i }), { target: { value: '2' } })

    // Now remaining is 2h 5m — Hours should appear in lead time
    expect(within(fields).getByRole('textbox', { name: /^hours$/i })).toBeInTheDocument()
    expect(within(fields).getByRole('textbox', { name: /^minutes$/i })).toBeInTheDocument()
  })

  it('resets a hidden field to 0 when it becomes visible again', () => {
    render(<CreateEditView onDone={() => {}} userId={null} />)

    // Expand duration to 2 hours so Hours field appears
    fireEvent.change(screen.getByRole('textbox', { name: /^hours$/i }), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: /set time/i }))

    // Set lead time hours to 1
    const fields = leadTimeFields()
    fireEvent.change(within(fields).getByRole('textbox', { name: /^hours$/i }), { target: { value: '1' } })
    expect(within(fields).getByRole('textbox', { name: /^hours$/i })).toHaveValue('01')

    // Shrink duration below 1 hour — Hours field hides
    fireEvent.change(screen.getAllByRole('textbox', { name: /^hours$/i })[0], { target: { value: '0' } })
    expect(within(fields).queryByRole('textbox', { name: /^hours$/i })).not.toBeInTheDocument()

    // Expand duration back above 1 hour — Hours field reappears, should be 0
    fireEvent.change(screen.getByRole('textbox', { name: /^hours$/i }), { target: { value: '2' } })
    expect(within(fields).getByRole('textbox', { name: /^hours$/i })).toHaveValue('00')
  })

  it('shows all four spinners when remaining time is >= 1 day', async () => {
    const futureTarget = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) // 2 days from now
    const id = await createTimer({ ...BASE, targetDatetime: futureTarget }, null)
    const existing = await db.timers.get(id!)

    render(<CreateEditView existing={existing} onDone={() => {}} userId={null} />)
    fireEvent.click(screen.getByRole('button', { name: /set time/i }))

    const fields = leadTimeFields()
    expect(within(fields).getByRole('textbox', { name: /^days$/i })).toBeInTheDocument()
    expect(within(fields).getByRole('textbox', { name: /^hours$/i })).toBeInTheDocument()
    expect(within(fields).getByRole('textbox', { name: /^minutes$/i })).toBeInTheDocument()
    expect(within(fields).getByRole('textbox', { name: /^seconds$/i })).toBeInTheDocument()
  })

  it('shows Hours, Minutes and Seconds when remaining time is >= 1 hour', async () => {
    const futureTarget = new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours from now
    const id = await createTimer({ ...BASE, targetDatetime: futureTarget }, null)
    const existing = await db.timers.get(id!)

    render(<CreateEditView existing={existing} onDone={() => {}} userId={null} />)
    fireEvent.click(screen.getByRole('button', { name: /set time/i }))

    const fields = leadTimeFields()
    expect(within(fields).getByRole('textbox', { name: /^hours$/i })).toBeInTheDocument()
    expect(within(fields).getByRole('textbox', { name: /^minutes$/i })).toBeInTheDocument()
    expect(within(fields).getByRole('textbox', { name: /^seconds$/i })).toBeInTheDocument()
    expect(within(fields).queryByRole('textbox', { name: /^days$/i })).not.toBeInTheDocument()
  })

  it('shows only Minutes and Seconds when remaining time is < 1 hour', () => {
    render(<CreateEditView onDone={() => {}} userId={null} />)
    // Default duration is 5 min — less than 1 hour
    fireEvent.click(screen.getByRole('button', { name: /set time/i }))

    const fields = leadTimeFields()
    expect(within(fields).getByRole('textbox', { name: /^minutes$/i })).toBeInTheDocument()
    expect(within(fields).getByRole('textbox', { name: /^seconds$/i })).toBeInTheDocument()
    expect(within(fields).queryByRole('textbox', { name: /^hours$/i })).not.toBeInTheDocument()
    expect(within(fields).queryByRole('textbox', { name: /^days$/i })).not.toBeInTheDocument()
  })

  it('removing lead time stores null', async () => {
    const id = await createTimer({ ...BASE, leadTimeMs: 900000 }, null)
    const existing = await db.timers.get(id!)

    render(<CreateEditView existing={existing} onDone={() => {}} userId={null} />)

    fireEvent.click(screen.getByRole('button', { name: /cancel reminder/i }))
    fireEvent.click(screen.getByRole('button', { name: /update timer/i }))

    await waitFor(async () => {
      const timer = await db.timers.get(id!)
      expect(timer?.leadTimeMs).toBeNull()
    })
  })
})

describe('CreateEditView — recurrence picker', () => {
  it('recurrence picker is absent for guests (userId=null)', () => {
    render(<CreateEditView onDone={() => {}} userId={null} />)

    expect(screen.queryByRole('button', { name: /set recurrence/i })).not.toBeInTheDocument()
  })

  it('recurrence field is hidden when mode is FromNow (logged-in user)', () => {
    render(<CreateEditView onDone={() => {}} userId="user-1" />)
    // default create mode is FromNow
    expect(screen.queryByRole('button', { name: /set recurrence/i })).not.toBeInTheDocument()
  })

  it('recurrence field appears when mode is AtTime', () => {
    render(<CreateEditView onDone={() => {}} userId="user-1" />)

    fireEvent.click(screen.getByRole('button', { name: /at time/i }))

    expect(screen.getByRole('button', { name: /set recurrence/i })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /recurrence/i })).not.toBeInTheDocument()
  })

  it('recurrence field is hidden in edit mode when time is locked', async () => {
    const id = await createTimer({ ...BASE }, 'user-1')
    const existing = await db.timers.get(id!)

    render(<CreateEditView existing={existing} onDone={() => {}} userId="user-1" />)

    // time not yet unlocked
    expect(screen.queryByRole('button', { name: /set recurrence/i })).not.toBeInTheDocument()
  })

  it('activating recurrence stores a daily recurrenceRule on create', async () => {
    render(<CreateEditView onDone={() => {}} userId="user-1" />)

    fireEvent.click(screen.getByRole('button', { name: /at time/i }))
    fireEvent.change(screen.getByPlaceholderText(/what are you timing/i), { target: { value: 'Daily' } })
    fireEvent.click(screen.getByRole('button', { name: /set recurrence/i }))
    fireEvent.click(screen.getByRole('button', { name: /create timer/i }))

    await waitFor(async () => {
      const timers = await db.timers.toArray()
      expect(timers[0].recurrenceRule).not.toBeNull()
      expect(timers[0].recurrenceRule?.cron).toMatch(/^\d+ \d+ \* \* \*$/)
      expect(typeof timers[0].recurrenceRule?.tz).toBe('string')
    })
  })

  it('custom weekly with days stores correct cron on create', async () => {
    render(<CreateEditView onDone={() => {}} userId="user-1" />)

    fireEvent.click(screen.getByRole('button', { name: /at time/i }))
    fireEvent.change(screen.getByPlaceholderText(/what are you timing/i), { target: { value: 'Custom' } })
    fireEvent.click(screen.getByRole('button', { name: /set recurrence/i }))
    fireEvent.change(screen.getByRole('combobox', { name: /recurrence/i }), { target: { value: 'custom' } })
    fireEvent.click(screen.getByRole('button', { name: /^mon$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^wed$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^fri$/i }))
    fireEvent.click(screen.getByRole('button', { name: /create timer/i }))

    await waitFor(async () => {
      const timers = await db.timers.toArray()
      expect(timers[0].recurrenceRule?.cron).toMatch(/\* \* 1,3,5$/)
    })
  })

  it('removing recurrence sets recurrenceRule to null on create', async () => {
    render(<CreateEditView onDone={() => {}} userId="user-1" />)

    fireEvent.click(screen.getByRole('button', { name: /at time/i }))
    fireEvent.change(screen.getByPlaceholderText(/what are you timing/i), { target: { value: 'Test' } })
    fireEvent.click(screen.getByRole('button', { name: /set recurrence/i }))
    fireEvent.click(screen.getByRole('button', { name: /remove recurrence/i }))
    fireEvent.click(screen.getByRole('button', { name: /create timer/i }))

    await waitFor(async () => {
      const timers = await db.timers.toArray()
      expect(timers[0].recurrenceRule).toBeNull()
    })
  })

  it('existing recurring timer shows picker pre-populated (no activate needed)', async () => {
    const id = await createTimer(
      { ...BASE, recurrenceRule: { cron: '0 9 * * *', tz: 'UTC' } },
      'user-1',
    )
    const existing = await db.timers.get(id!)

    render(<CreateEditView existing={existing} onDone={() => {}} userId="user-1" />)
    fireEvent.click(screen.getByText(/edit time/i))
    fireEvent.click(screen.getByRole('button', { name: /at time/i }))

    expect(screen.getByRole('combobox', { name: /recurrence/i })).toHaveValue('daily')
  })

  it('updating recurrence on edit stores new rule', async () => {
    const id = await createTimer({ ...BASE }, 'user-1')
    const existing = await db.timers.get(id!)

    render(<CreateEditView existing={existing} onDone={() => {}} userId="user-1" />)

    fireEvent.click(screen.getByText(/edit time/i))
    fireEvent.click(screen.getByRole('button', { name: /at time/i }))
    fireEvent.click(screen.getByRole('button', { name: /set recurrence/i }))
    fireEvent.change(screen.getByRole('combobox', { name: /recurrence/i }), { target: { value: 'daily' } })
    fireEvent.click(screen.getByRole('button', { name: /update timer/i }))

    await waitFor(async () => {
      const timer = await db.timers.get(id!)
      expect(timer?.recurrenceRule?.cron).toMatch(/^\d+ \d+ \* \* \*$/)
    })
  })
})
