import 'fake-indexeddb/auto'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db'
import { SyncStatuses } from '../db/schema'
import type { Group } from '../db/schema'
import { GroupCreateEditView } from '../components/GroupCreateEditView'

const BASE_GROUP = {
  serverId: null,
  userId: 'user-1',
  name: 'High Priority',
  emoji: '🔴',
  color: '#ef4444',
  conditions: {
    op: 'AND' as const,
    conditions: [{ field: 'priority' as const, op: 'eq' as const, value: 'high' as const }],
  },
  version: null,
  syncStatus: SyncStatuses.Synced,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies Omit<Group, 'id'>

beforeEach(async () => {
  await db.groups.clear()
})

describe('GroupCreateEditView', () => {
  it('saves a new group with a name to Dexie with syncStatus pending', async () => {
    render(<GroupCreateEditView userId="user-1" onDone={() => {}} onCancel={() => {}} />)

    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), {
      target: { value: 'My Group' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(async () => {
      const groups = await db.groups.toArray()
      expect(groups).toHaveLength(1)
      expect(groups[0].name).toBe('My Group')
      expect(groups[0].syncStatus).toBe(SyncStatuses.Pending)
    })
  })

  it('calls onDone after saving', async () => {
    const onDone = vi.fn()
    render(<GroupCreateEditView userId="user-1" onDone={onDone} onCancel={() => {}} />)

    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), {
      target: { value: 'My Group' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  })

  it('saves a group with a condition added via the condition builder', async () => {
    render(<GroupCreateEditView userId="user-1" onDone={() => {}} onCancel={() => {}} />)

    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), {
      target: { value: 'Overdue' },
    })

    fireEvent.click(screen.getByRole('button', { name: /add condition/i }))
    const fieldSelect = screen.getByRole('combobox', { name: /field/i })
    fireEvent.change(fieldSelect, { target: { value: 'targetDatetime' } })
    const opSelect = screen.getByRole('combobox', { name: /operator/i })
    fireEvent.change(opSelect, { target: { value: 'overdue' } })

    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(async () => {
      const groups = await db.groups.toArray()
      expect(groups[0].conditions.conditions).toHaveLength(1)
      expect(groups[0].conditions.conditions[0]).toMatchObject({
        field: 'targetDatetime',
        op: 'overdue',
      })
    })
  })

  it('pre-populates the form when editing an existing group', async () => {
    const id = await db.groups.add({ ...BASE_GROUP }) as number
    const existing = await db.groups.get(id)
    if (!existing) throw new Error('group not found')

    render(<GroupCreateEditView userId="user-1" onDone={() => {}} onCancel={() => {}} existing={existing} />)

    expect(screen.getByRole('textbox', { name: /name/i })).toHaveValue('High Priority')
  })

  it('updates the group in Dexie when editing', async () => {
    const id = await db.groups.add({ ...BASE_GROUP }) as number
    const existing = await db.groups.get(id)
    if (!existing) throw new Error('group not found')

    render(<GroupCreateEditView userId="user-1" onDone={() => {}} onCancel={() => {}} existing={existing} />)

    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), {
      target: { value: 'Renamed Group' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(async () => {
      const group = await db.groups.get(id)
      expect(group?.name).toBe('Renamed Group')
      expect(group?.syncStatus).toBe(SyncStatuses.Pending)
    })
  })
})
