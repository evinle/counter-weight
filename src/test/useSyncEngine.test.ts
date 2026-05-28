import 'fake-indexeddb/auto'
import { TRPCClientError } from '@trpc/client'
import { renderHook, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db'
import { useSyncEngine, triggerSync } from '../hooks/useSyncEngine'
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

const USER = { userId: 'user-1', email: 'user@example.com', firstName: 'Test' } satisfies AuthUser

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
  // Reset module-level currentUser between tests
  renderHook(() => useSyncEngine({ user: null }))
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

    const conflictError = new TRPCClientError('Conflict', {
      result: { error: { data: { code: 'CONFLICT' }, message: 'Conflict', code: -32600 } },
    })
    vi.mocked(trpc.timers.upsert.mutate).mockRejectedValueOnce(conflictError)
    vi.mocked(trpc.timers.get.query).mockResolvedValueOnce({
      id: 'existing-srv',
      title: 'Server version',
      description: null,
      emoji: null,
      targetDatetime: '2026-06-01T12:00:00.000Z',
      originalTargetDatetime: '2026-06-01T12:00:00.000Z',
      status: 'active',
      priority: 'medium',
      isFlagged: false,
      recurrenceRule: null,
      version: 5,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
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

  it('reconcile: adds a server record not present in Dexie', async () => {
    vi.mocked(trpc.timers.upsert.mutate).mockResolvedValueOnce({ serverId: 'x', version: 1 })
    vi.mocked(trpc.timers.reconcile.query).mockResolvedValueOnce([
      {
        id: 'srv-new',
        title: 'From Server',
        description: null,
        emoji: null,
        targetDatetime: '2026-06-01T12:00:00.000Z',
        originalTargetDatetime: '2026-06-01T12:00:00.000Z',
        status: 'active',
        priority: 'medium',
        isFlagged: false,
        recurrenceRule: null,
        version: 1,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
        userId: 'user-1',
        groupId: null,
        eventbridgeScheduleId: null,
      },
    ])

    renderHook(() => useSyncEngine({ user: USER }))

    await waitFor(async () => {
      const timers = await db.timers.toArray()
      expect(timers.some(t => t.serverId === 'srv-new' && t.title === 'From Server')).toBe(true)
    })
  })

  it('reconcile: updates a stale local record with the server version', async () => {
    const id = await db.timers.add({
      ...BASE_TIMER,
      serverId: 'srv-existing',
      syncStatus: 'synced',
      version: 1,
    })

    vi.mocked(trpc.timers.reconcile.query).mockResolvedValueOnce([
      {
        id: 'srv-existing',
        title: 'Updated By Server',
        description: null,
        emoji: null,
        targetDatetime: '2026-06-01T12:00:00.000Z',
        originalTargetDatetime: '2026-06-01T12:00:00.000Z',
        status: 'active',
        priority: 'medium',
        isFlagged: false,
        recurrenceRule: null,
        version: 2,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
        userId: 'user-1',
        groupId: null,
        eventbridgeScheduleId: null,
      },
    ])

    renderHook(() => useSyncEngine({ user: USER }))

    await waitFor(async () => {
      const timer = await db.timers.get(id)
      expect(timer?.title).toBe('Updated By Server')
      expect(timer?.version).toBe(2)
    })
  })
})

describe('live query drain trigger', () => {
  it('drains a pending timer added after mount without calling reconcile', async () => {
    vi.mocked(trpc.timers.upsert.mutate).mockResolvedValue({ serverId: 'x', version: 1 })
    vi.mocked(trpc.timers.reconcile.query).mockResolvedValue([])

    renderHook(() => useSyncEngine({ user: USER }))
    await waitFor(() => expect(trpc.timers.reconcile.query).toHaveBeenCalledTimes(1))

    vi.clearAllMocks()
    vi.mocked(trpc.timers.upsert.mutate).mockResolvedValueOnce({ serverId: 'srv-live', version: 1 })

    const id = await db.timers.add({
      ...BASE_TIMER,
      serverId: null,
      syncStatus: 'pending',
    })

    await waitFor(async () => {
      const timer = await db.timers.get(id)
      expect(timer?.syncStatus).toBe('synced')
    })

    expect(trpc.timers.upsert.mutate).toHaveBeenCalled()
    expect(trpc.timers.reconcile.query).not.toHaveBeenCalled()
  })
})

describe('triggerSync', () => {
  it('is a no-op when user is null', async () => {
    await triggerSync()
    expect(trpc.timers.reconcile.query).not.toHaveBeenCalled()
    expect(trpc.timers.upsert.mutate).not.toHaveBeenCalled()
  })

  it('adds a server record not present in Dexie without calling upsert', async () => {
    // Let the mount sync settle with an empty reconcile response, then trigger
    vi.mocked(trpc.timers.reconcile.query).mockResolvedValueOnce([])
    renderHook(() => useSyncEngine({ user: USER }))
    await waitFor(() => expect(trpc.timers.reconcile.query).toHaveBeenCalledTimes(1))

    vi.clearAllMocks()
    vi.mocked(trpc.timers.reconcile.query).mockResolvedValueOnce([
      {
        id: 'srv-trigger-new',
        title: 'Pulled By triggerSync',
        description: null,
        emoji: null,
        targetDatetime: '2026-06-01T12:00:00.000Z',
        originalTargetDatetime: '2026-06-01T12:00:00.000Z',
        status: 'active',
        priority: 'medium',
        isFlagged: false,
        recurrenceRule: null,
        version: 1,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
        userId: 'user-1',
        groupId: null,
        eventbridgeScheduleId: null,
      },
    ])

    await triggerSync()

    const timers = await db.timers.toArray()
    expect(timers.some(t => t.serverId === 'srv-trigger-new' && t.title === 'Pulled By triggerSync')).toBe(true)
    expect(trpc.timers.upsert.mutate).not.toHaveBeenCalled()
  })

  it('updates a stale local record without calling upsert', async () => {
    const id = await db.timers.add({
      ...BASE_TIMER,
      serverId: 'srv-stale',
      syncStatus: 'synced',
      version: 1,
    })

    // Let the mount sync settle with an empty reconcile response, then trigger
    vi.mocked(trpc.timers.reconcile.query).mockResolvedValueOnce([])
    renderHook(() => useSyncEngine({ user: USER }))
    await waitFor(() => expect(trpc.timers.reconcile.query).toHaveBeenCalledTimes(1))

    vi.clearAllMocks()
    vi.mocked(trpc.timers.reconcile.query).mockResolvedValueOnce([
      {
        id: 'srv-stale',
        title: 'Refreshed By triggerSync',
        description: null,
        emoji: null,
        targetDatetime: '2026-06-01T12:00:00.000Z',
        originalTargetDatetime: '2026-06-01T12:00:00.000Z',
        status: 'active',
        priority: 'medium',
        isFlagged: false,
        recurrenceRule: null,
        version: 3,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
        userId: 'user-1',
        groupId: null,
        eventbridgeScheduleId: null,
      },
    ])

    await triggerSync()

    const timer = await db.timers.get(id)
    expect(timer?.title).toBe('Refreshed By triggerSync')
    expect(timer?.version).toBe(3)
    expect(trpc.timers.upsert.mutate).not.toHaveBeenCalled()
  })
})
