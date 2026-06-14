import 'fake-indexeddb/auto'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db'
import { SyncStatuses } from '../db/schema'
import type { Group } from '../db/schema'
import { GroupListView } from '../components/GroupListView'

const BASE_GROUP = {
  serverId: 'srv-group-1',
  userId: 'user-1',
  emoji: '🔴',
  color: '#ef4444',
  conditions: { op: 'AND' as const, conditions: [] },
  version: 1,
  syncStatus: SyncStatuses.Synced,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies Omit<Group, 'id' | 'name'>

beforeEach(async () => {
  await db.groups.clear()
})

describe('GroupListView', () => {
  it('lists all non-deleted groups', async () => {
    await db.groups.add({ ...BASE_GROUP, name: 'High Priority' })
    await db.groups.add({ ...BASE_GROUP, serverId: 'srv-group-2', name: 'Overdue' })

    render(<GroupListView userId="user-1" onEdit={() => {}} onCreateNew={() => {}} onDone={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText('High Priority')).toBeInTheDocument()
      expect(screen.getByText('Overdue')).toBeInTheDocument()
    })
  })

  it('shows a delete button per group', async () => {
    await db.groups.add({ ...BASE_GROUP, name: 'High Priority' })

    render(<GroupListView userId="user-1" onEdit={() => {}} onCreateNew={() => {}} onDone={() => {}} />)

    await waitFor(() => expect(screen.getByText('High Priority')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /delete high priority/i })).toBeInTheDocument()
  })

  it('shows a confirmation prompt on first delete tap', async () => {
    await db.groups.add({ ...BASE_GROUP, name: 'High Priority' })

    render(<GroupListView userId="user-1" onEdit={() => {}} onCreateNew={() => {}} onDone={() => {}} />)

    await waitFor(() => expect(screen.getByText('High Priority')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /delete high priority/i }))

    expect(screen.getByRole('button', { name: /confirm delete/i })).toBeInTheDocument()
  })

  it('soft-deletes the group on confirm and removes it from the list', async () => {
    const id = await db.groups.add({ ...BASE_GROUP, name: 'High Priority' }) as number

    render(<GroupListView userId="user-1" onEdit={() => {}} onCreateNew={() => {}} onDone={() => {}} />)

    await waitFor(() => expect(screen.getByText('High Priority')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /delete high priority/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }))

    await waitFor(async () => {
      const group = await db.groups.get(id)
      expect(group?.syncStatus).toBe(SyncStatuses.Deleted)
      expect(screen.queryByText('High Priority')).toBeNull()
    })
  })

  it('cancels deletion if the user taps elsewhere before confirming', async () => {
    const id = await db.groups.add({ ...BASE_GROUP, name: 'High Priority' }) as number

    render(<GroupListView userId="user-1" onEdit={() => {}} onCreateNew={() => {}} onDone={() => {}} />)

    await waitFor(() => expect(screen.getByText('High Priority')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /delete high priority/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    const group = await db.groups.get(id)
    expect(group?.syncStatus).toBe(SyncStatuses.Synced)
    expect(screen.getByText('High Priority')).toBeInTheDocument()
  })

  it('calls onEdit with the group when the edit button is tapped', async () => {
    const id = await db.groups.add({ ...BASE_GROUP, name: 'High Priority' }) as number
    const onEdit = vi.fn()

    render(<GroupListView userId="user-1" onEdit={onEdit} onCreateNew={() => {}} onDone={() => {}} />)

    await waitFor(() => expect(screen.getByText('High Priority')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /edit high priority/i }))

    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id, name: 'High Priority' }))
  })
})
