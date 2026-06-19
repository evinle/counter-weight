import 'fake-indexeddb/auto'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

  it('clicking Add lead time reveals Minutes and Seconds spinners', () => {
    render(<CreateEditView onDone={() => {}} userId={null} />)

    fireEvent.click(screen.getByRole('button', { name: /add lead time/i }))

    expect(screen.getByRole('textbox', { name: /^minutes$/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /^seconds$/i })).toBeInTheDocument()
  })

  it('adding a lead time stores it as milliseconds', async () => {
    render(<CreateEditView onDone={() => {}} userId={null} />)

    fireEvent.change(screen.getByPlaceholderText(/what are you timing/i), { target: { value: 'Test' } })
    fireEvent.click(screen.getByRole('button', { name: /add lead time/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /^minutes$/i }), { target: { value: '10' } })
    fireEvent.change(screen.getByRole('textbox', { name: /^seconds$/i }), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: /create timer/i }))

    await waitFor(async () => {
      const timers = await db.timers.toArray()
      expect(timers[0].leadTimeMs).toBe((10 * 60 + 30) * 1000)
    })
  })

  it('existing lead time decomposes into minute and second spinners', async () => {
    const id = await createTimer({ ...BASE, leadTimeMs: (15 * 60 + 45) * 1000 }, null)
    const existing = await db.timers.get(id!)

    render(<CreateEditView existing={existing} onDone={() => {}} userId={null} />)

    expect(screen.getByRole('textbox', { name: /^minutes$/i })).toHaveValue('15')
    expect(screen.getByRole('textbox', { name: /^seconds$/i })).toHaveValue('45')
  })

  it('removing lead time stores null', async () => {
    const id = await createTimer({ ...BASE, leadTimeMs: 900000 }, null)
    const existing = await db.timers.get(id!)

    render(<CreateEditView existing={existing} onDone={() => {}} userId={null} />)

    fireEvent.click(screen.getByRole('button', { name: /remove lead time/i }))
    fireEvent.click(screen.getByRole('button', { name: /update timer/i }))

    await waitFor(async () => {
      const timer = await db.timers.get(id!)
      expect(timer?.leadTimeMs).toBeNull()
    })
  })
})
