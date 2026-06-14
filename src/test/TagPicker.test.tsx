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

describe('TagPicker manage mode', () => {
  it('shows a Manage button and no × buttons initially', async () => {
    await seedTag('Work')

    render(<TagPicker userId="user-1" onChange={() => {}} />)

    await waitFor(() => expect(screen.getByText('Work')).toBeInTheDocument())

    expect(screen.getByRole('button', { name: /manage/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /×/ })).toBeNull()
  })

  it('reveals × buttons for each tag when Manage is clicked', async () => {
    await seedTag('Work')
    await seedTag('Personal')

    render(<TagPicker userId="user-1" onChange={() => {}} />)

    await waitFor(() => expect(screen.getByText('Work')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /manage/i }))

    expect(screen.getAllByRole('button', { name: /×/ })).toHaveLength(2)
  })

  it('does not show × on a currently selected tag', async () => {
    const id = await seedTag('Work', 'srv-work')

    render(<TagPicker userId="user-1" initialServerIds={['srv-work']} onChange={() => {}} />)

    await waitFor(() => expect(screen.getByText('Work')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /manage/i }))

    // One tag, but it's selected — × must NOT appear for it
    expect(screen.queryByRole('button', { name: /×/ })).toBeNull()

    // Suppress unused var warning — id is the Dexie id we seeded
    void id
  })

  it('calls deleteTag when × is clicked on an unselected tag', async () => {
    await seedTag('Work', 'srv-work')

    render(<TagPicker userId="user-1" onChange={() => {}} />)

    await waitFor(() => expect(screen.getByText('Work')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /manage/i }))
    fireEvent.click(screen.getByRole('button', { name: /×/ }))

    await waitFor(async () => {
      const tags = await db.tags.toArray()
      // synced tag: should be marked deleted, not hard-deleted
      expect(tags[0]?.syncStatus).toBe(SyncStatuses.Deleted)
    })
  })
})
