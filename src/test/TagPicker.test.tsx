import 'fake-indexeddb/auto'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db'
import { SyncStatuses } from '../db/schema'
import { TagPicker } from '../components/TagPicker'

vi.mock('../lib/trpc', () => ({
  trpc: {
    tags: {
      upsert: { mutate: vi.fn() },
      delete: { mutate: vi.fn() },
    },
  },
}))

beforeEach(async () => {
  await db.tags.clear()
  await db.timers.clear()
  vi.clearAllMocks()
})

async function seedTag(name: string, serverId: string | null = `srv-${name}`) {
  return db.tags.add({
    name,
    serverId,
    userId: 'user-1',
    color: '#3b82f6',
    emoji: null,
    version: 1,
    syncStatus: SyncStatuses.Synced,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

async function longPress(el: HTMLElement) {
  fireEvent.pointerDown(el)
  // Allow the 0ms macrotask to fire before continuing
  await new Promise<void>((resolve) => setTimeout(resolve, 10))
}

describe('TagPicker long-press popover', () => {
  it('shows no popover on initial render', async () => {
    await seedTag('Work')
    render(<TagPicker userId="user-1" onChange={() => {}} longPressMs={0} />)
    await waitFor(() => expect(screen.getByText('Work')).toBeInTheDocument())

    expect(screen.queryByRole('button', { name: /rename/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()
  })

  it('reveals Rename and Delete options after long press on a tag', async () => {
    await seedTag('Work')
    render(<TagPicker userId="user-1" onChange={() => {}} longPressMs={0} />)
    await waitFor(() => expect(screen.getByText('Work')).toBeInTheDocument())

    await longPress(screen.getByRole('button', { name: /Work/ }))

    expect(screen.getByRole('button', { name: /rename/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
  })

  it('does not open the popover when pointerUp cancels before the threshold', async () => {
    await seedTag('Work')
    render(<TagPicker userId="user-1" onChange={() => {}} longPressMs={500} />)
    await waitFor(() => expect(screen.getByText('Work')).toBeInTheDocument())

    const btn = screen.getByRole('button', { name: /Work/ })
    fireEvent.pointerDown(btn)
    fireEvent.pointerUp(btn)

    expect(screen.queryByRole('button', { name: /rename/i })).toBeNull()
  })

  it('opens an inline rename input when Rename is tapped', async () => {
    await seedTag('Work')
    render(<TagPicker userId="user-1" onChange={() => {}} longPressMs={0} />)
    await waitFor(() => expect(screen.getByText('Work')).toBeInTheDocument())

    await longPress(screen.getByRole('button', { name: /Work/ }))
    fireEvent.click(screen.getByRole('button', { name: /rename/i }))

    expect(screen.getByRole('textbox')).toHaveValue('Work')
  })

  it('commits the rename on Enter and marks the tag pending', async () => {
    await seedTag('Work')
    render(<TagPicker userId="user-1" onChange={() => {}} longPressMs={0} />)
    await waitFor(() => expect(screen.getByText('Work')).toBeInTheDocument())

    await longPress(screen.getByRole('button', { name: /Work/ }))
    fireEvent.click(screen.getByRole('button', { name: /rename/i }))

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Personal' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(async () => {
      const tags = await db.tags.toArray()
      expect(tags[0]?.name).toBe('Personal')
      expect(tags[0]?.syncStatus).toBe(SyncStatuses.Pending)
    })
  })

  it('marks a synced tag deleted when Delete is tapped', async () => {
    await seedTag('Work')
    render(<TagPicker userId="user-1" onChange={() => {}} longPressMs={0} />)
    await waitFor(() => expect(screen.getByText('Work')).toBeInTheDocument())

    await longPress(screen.getByRole('button', { name: /Work/ }))
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))

    await waitFor(async () => {
      const tags = await db.tags.toArray()
      expect(tags[0]?.syncStatus).toBe(SyncStatuses.Deleted)
    })
  })

  it('deleted tag disappears from view immediately', async () => {
    await seedTag('Work')
    render(<TagPicker userId="user-1" onChange={() => {}} longPressMs={0} />)
    await waitFor(() => expect(screen.getByText('Work')).toBeInTheDocument())

    await longPress(screen.getByRole('button', { name: /Work/ }))
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))

    await waitFor(() => expect(screen.queryByText('Work')).toBeNull())
  })

  it('onChange is called without deleted tag serverId after deletion', async () => {
    const id = await seedTag('Work')
    const onChange = vi.fn()
    render(<TagPicker userId="user-1" initialServerIds={['srv-Work']} onChange={onChange} longPressMs={0} />)
    await waitFor(() => expect(screen.getByText('Work')).toBeInTheDocument())

    await longPress(screen.getByRole('button', { name: /Work/ }))
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))

    await waitFor(() => {
      const lastCall = onChange.mock.calls.at(-1)?.[0] as string[]
      expect(lastCall).not.toContain('srv-Work')
    })
    void id
  })
})
