import 'fake-indexeddb/auto'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db'
import { SyncStatuses } from '../db/schema'
import { GroupSearchPanel } from '../components/GroupSearchPanel'
import { useViewStore } from '../store/viewStore'
import type { Group } from '../db/schema'

const BASE_GROUP = {
  serverId: null,
  userId: 'user-1',
  emoji: '🔴',
  color: '#ef4444',
  conditions: { op: 'AND' as const, conditions: [] },
  version: null,
  syncStatus: SyncStatuses.Synced,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies Omit<Group, 'id' | 'name'>

beforeEach(async () => {
  await db.groups.clear()
  useViewStore.setState({ selectedGroupId: null })
})

describe('GroupSearchPanel', () => {
  it('shows the filter icon button and no panel on initial render', () => {
    render(<GroupSearchPanel userId="user-1" onManageGroups={() => {}} />)

    expect(screen.getByRole('button', { name: /filter/i })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('opens the panel and shows all groups on filter icon click', async () => {
    await db.groups.add({ ...BASE_GROUP, name: 'High Priority' })
    await db.groups.add({ ...BASE_GROUP, name: 'Overdue' })

    render(<GroupSearchPanel userId="user-1" onManageGroups={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /filter/i }))

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument()
      expect(screen.getByText('High Priority')).toBeInTheDocument()
      expect(screen.getByText('Overdue')).toBeInTheDocument()
    })
  })

  it('narrows the group list as the user types', async () => {
    await db.groups.add({ ...BASE_GROUP, name: 'High Priority' })
    await db.groups.add({ ...BASE_GROUP, name: 'Overdue' })

    render(<GroupSearchPanel userId="user-1" onManageGroups={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /filter/i }))

    await waitFor(() => expect(screen.getByText('High Priority')).toBeInTheDocument())

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'over' } })

    await waitFor(() => {
      expect(screen.getByText('Overdue')).toBeInTheDocument()
      expect(screen.queryByText('High Priority')).toBeNull()
    })
  })

  it('selecting a group updates viewStore and shows the active filter badge', async () => {
    const id = await db.groups.add({ ...BASE_GROUP, name: 'High Priority' }) as number

    render(<GroupSearchPanel userId="user-1" onManageGroups={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /filter/i }))

    await waitFor(() => expect(screen.getByText('High Priority')).toBeInTheDocument())
    fireEvent.click(screen.getByText('High Priority'))

    expect(useViewStore.getState().selectedGroupId).toBe(id)
    expect(screen.getByRole('button', { name: /clear filter/i })).toBeInTheDocument()
  })

  it('clicking the X on the active filter badge clears the selection', async () => {
    const id = await db.groups.add({ ...BASE_GROUP, name: 'High Priority' }) as number
    useViewStore.setState({ selectedGroupId: id })

    render(<GroupSearchPanel userId="user-1" onManageGroups={() => {}} />)

    await waitFor(() => expect(screen.getByRole('button', { name: /clear filter/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /clear filter/i }))

    expect(useViewStore.getState().selectedGroupId).toBeNull()
  })

  it('does not show deleted groups in the list', async () => {
    await db.groups.add({ ...BASE_GROUP, name: 'Visible' })
    await db.groups.add({ ...BASE_GROUP, name: 'Gone', syncStatus: SyncStatuses.Deleted })

    render(<GroupSearchPanel userId="user-1" onManageGroups={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /filter/i }))

    await waitFor(() => expect(screen.getByText('Visible')).toBeInTheDocument())
    expect(screen.queryByText('Gone')).toBeNull()
  })
})
