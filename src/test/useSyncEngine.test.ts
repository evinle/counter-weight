import 'fake-indexeddb/auto'
import { renderHook, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db'
import { useSyncEngine } from '../hooks/useSyncEngine'
import type { AuthUser } from '../hooks/useAuth'

// Mock the tRPC client
vi.mock('../lib/trpc', () => ({
  trpc: {
    timers: {
      upsert: { mutate: vi.fn() },
      get: { query: vi.fn() },
      list: { query: vi.fn() },
      reconcile: { query: vi.fn() },
    },
  },
  idToken: 'mock-token',
  setIdToken: vi.fn(),
}))

import { trpc } from '../lib/trpc'

const USER: AuthUser = { userId: 'user-1', email: 'user@example.com' }

const BASE_TIMER = {
  title: 'Test',
  description: null,
  emoji: null,
  targetDatetime: new Date('2026-06-01T12:00:00Z'),
  originalTargetDatetime: new Date('2026-06-01T12:00:00Z'),
  status: 'active' as const,
  priority: 'medium' as const,
  isFlagged: false,
  groupId: null,
  recurrenceRule: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  userId: 'user-1',
  version: null,
}

beforeEach(async () => {
  await db.timers.clear()
  vi.clearAllMocks()
  localStorage.clear()
})

describe('useSyncEngine', () => {
  it('drains pending timers and marks them synced on success', async () => {
    const id = await db.timers.add({
      ...BASE_TIMER,
      serverId: null,
      syncStatus: 'pending',
    })

    vi.mocked(trpc.timers.upsert.mutate).mockResolvedValueOnce({
      serverId: 'srv-uuid',
      version: 1,
    })
    vi.mocked(trpc.timers.reconcile.query).mockResolvedValueOnce([])

    renderHook(() => useSyncEngine({ user: USER }))

    await waitFor(async () => {
      const timer = await db.timers.get(id)
      expect(timer?.syncStatus).toBe('synced')
      expect(timer?.serverId).toBe('srv-uuid')
    })
  })

  it('overwrites Dexie with server record on 409 conflict and logs it', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const id = await db.timers.add({
      ...BASE_TIMER,
      serverId: 'existing-srv',
      syncStatus: 'pending',
      version: 1,
    })

    const conflictError = Object.assign(new Error('Conflict'), {
      data: { code: 'CONFLICT' },
    })
    vi.mocked(trpc.timers.upsert.mutate).mockRejectedValueOnce(conflictError)
    vi.mocked(trpc.timers.get.query).mockResolvedValueOnce({
      id: 'existing-srv',
      title: 'Server version',
      description: null,
      emoji: null,
      targetDatetime: new Date('2026-06-01T12:00:00Z'),
      originalTargetDatetime: new Date('2026-06-01T12:00:00Z'),
      status: 'active',
      priority: 'medium',
      isFlagged: false,
      recurrenceRule: null,
      version: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: 'user-1',
      groupId: null,
      eventbridgeScheduleId: null,
    })
    vi.mocked(trpc.timers.reconcile.query).mockResolvedValueOnce([])

    renderHook(() => useSyncEngine({ user: USER }))

    await waitFor(async () => {
      const timer = await db.timers.get(id)
      expect(timer?.title).toBe('Server version')
      expect(timer?.syncStatus).toBe('synced')
    })

    expect(consoleSpy).toHaveBeenCalledWith(
      '[conflict] overwriting local timer',
      expect.objectContaining({ timerId: id, userId: 'user-1' }),
    )
  })

  it('does nothing when user is null', () => {
    renderHook(() => useSyncEngine({ user: null }))
    expect(trpc.timers.upsert.mutate).not.toHaveBeenCalled()
  })
})
