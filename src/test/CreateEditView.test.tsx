import 'fake-indexeddb/auto'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '../db'
import { createTimer } from '../hooks/useTimers'
import * as useTimersMod from '../hooks/useTimers'
import { CreateEditView } from '../components/CreateEditView'
import { useToastStore } from '../hooks/useToast'
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
} satisfies Omit<Timer, 'id' | 'createdAt' | 'updatedAt' | 'originalTargetDatetime' | 'serverId' | 'userId' | 'syncStatus' | 'version'>

beforeEach(async () => {
  await db.timers.clear()
  useToastStore.setState({ toasts: [] })
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

  it('reveals time inputs after clicking Edit time', async () => {
    const id = await createTimer(BASE, null)
    const existing = await db.timers.get(id!)

    render(<CreateEditView existing={existing} onDone={() => {}} userId={null} />)

    fireEvent.click(screen.getByText(/edit time/i))

    expect(screen.getByRole('button', { name: /from now/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /at time/i })).toBeInTheDocument()
  })

  it('hides time inputs again after cancelling the time edit', async () => {
    const id = await createTimer(BASE, null)
    const existing = await db.timers.get(id!)

    render(<CreateEditView existing={existing} onDone={() => {}} userId={null} />)

    fireEvent.click(screen.getByText(/edit time/i))
    fireEvent.click(screen.getByText(/cancel time edit/i))

    expect(screen.queryByRole('button', { name: /from now/i })).not.toBeInTheDocument()
    expect(screen.getByText(/edit time/i)).toBeInTheDocument()
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

  it('shows an error toast when editTimer signals a blocked extension', async () => {
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

    vi.restoreAllMocks()
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
