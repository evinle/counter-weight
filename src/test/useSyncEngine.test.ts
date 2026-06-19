import 'fake-indexeddb/auto'
import { fromPartial } from '@total-typescript/shoehorn'
import { TRPCClientError } from '@trpc/client'
import { renderHook, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db'
import { SyncStatuses, TimerType } from '../db/schema'
import { useSyncEngine } from '../hooks/useSyncEngine'
import type { AuthUser } from '../hooks/useAuth'

// Mock the tRPC client
vi.mock('../lib/trpc', () => ({
  trpc: {
    timers: {
      upsert: { mutate: vi.fn() },
      complete: { mutate: vi.fn() },
      cancel: { mutate: vi.fn() },
      get: { query: vi.fn() },
      list: { query: vi.fn() },
      reconcile: { query: vi.fn() },
    },
    tags: {
      upsert: { mutate: vi.fn() },
      delete: { mutate: vi.fn() },
      reconcile: { query: vi.fn() },
    },
    groups: {
      upsert: { mutate: vi.fn() },
      delete: { mutate: vi.fn() },
      reconcile: { query: vi.fn() },
    },
  },
  idToken: 'mock-token',
  setIdToken: vi.fn(),
}))

import { trpc } from '../lib/trpc'

const EMPTY_TAGS_RECONCILE = { tags: [], serverNow: '2026-06-08T00:00:00.000Z' }
const EMPTY_GROUPS_RECONCILE = { groups: [], serverNow: '2026-06-08T00:00:00.000Z' }

const USER = { userId: 'user-1', email: 'user@example.com', firstName: 'Test' } satisfies AuthUser

const BASE_TIMER = {
  title: 'Test',
  description: null,
  emoji: null,
  targetDatetime: new Date('2026-06-01T12:00:00Z'),
  originalTargetDatetime: new Date('2026-06-01T12:00:00Z'),
  status: 'active' as const,
  priority: 'medium' as const,
  recurrenceRule: null,
  tagIds: [] as string[],
  timerType: TimerType.Reminder,
  leadTimeMs: null,
  workSessions: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  userId: 'user-1',
  version: null,
}

beforeEach(async () => {
  await db.timers.clear()
  await db.tags.clear()
  await db.groups.clear()
  vi.clearAllMocks()
  localStorage.clear()
  vi.mocked(trpc.tags.reconcile.query).mockResolvedValue(EMPTY_TAGS_RECONCILE)
  vi.mocked(trpc.groups.reconcile.query).mockResolvedValue(EMPTY_GROUPS_RECONCILE)
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

    vi.mocked(trpc.timers.upsert.mutate).mockResolvedValueOnce(fromPartial({
      serverId: 'srv-uuid',
      version: 1,
    }))
    vi.mocked(trpc.timers.reconcile.query).mockResolvedValueOnce({ timers: [], serverNow: '2026-06-08T00:00:00.000Z' })

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
      recurrenceRule: null,
      version: 5,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
      userId: 'user-1',
      eventbridgeScheduleId: null,
      tagIds: [],
      timerType: TimerType.Reminder,
      leadTimeMs: null,
    })
    vi.mocked(trpc.timers.reconcile.query).mockResolvedValueOnce({ timers: [], serverNow: '2026-06-08T00:00:00.000Z' })

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
    vi.mocked(trpc.timers.upsert.mutate).mockResolvedValueOnce(fromPartial({ serverId: 'x', version: 1 }))
    vi.mocked(trpc.timers.reconcile.query).mockResolvedValueOnce({
      serverNow: '2026-06-08T00:00:00.000Z',
      timers: [fromPartial({
        id: 'srv-new',
        title: 'From Server',
        status: 'active',
        version: 1,
        userId: 'user-1',
      })],
    })

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

    vi.mocked(trpc.timers.reconcile.query).mockResolvedValueOnce({
      serverNow: '2026-06-08T00:00:00.000Z',
      timers: [fromPartial({
        id: 'srv-existing',
        title: 'Updated By Server',
        status: 'active',
        version: 2,
        userId: 'user-1',
      })],
    })

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
    vi.mocked(trpc.timers.upsert.mutate).mockResolvedValue(fromPartial({ serverId: 'x', version: 1 }))
    vi.mocked(trpc.timers.reconcile.query).mockResolvedValue({ timers: [], serverNow: '2026-06-08T00:00:00.000Z' })

    renderHook(() => useSyncEngine({ user: USER }))
    await waitFor(() => expect(trpc.timers.reconcile.query).toHaveBeenCalledTimes(1))

    vi.clearAllMocks()
    vi.mocked(trpc.timers.upsert.mutate).mockResolvedValueOnce(fromPartial({ serverId: 'srv-live', version: 1 }))

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

describe('drain routing by status', () => {
  it('completed timer calls timers.complete and is marked synced', async () => {
    // Arrange
    vi.mocked(trpc.timers.reconcile.query).mockResolvedValue({ timers: [], serverNow: '2026-06-08T00:00:00.000Z' })
    const id = await db.timers.add({
      ...BASE_TIMER,
      status: 'completed',
      serverId: 'srv-done',
      syncStatus: 'pending',
      version: 2,
    })

    vi.mocked(trpc.timers.complete.mutate).mockResolvedValueOnce({ ok: true })

    // Act
    renderHook(() => useSyncEngine({ user: USER }))

    // Assert
    await waitFor(async () => {
      const timer = await db.timers.get(id)
      expect(timer?.syncStatus).toBe('synced')
    })
    expect(trpc.timers.complete.mutate).toHaveBeenCalledWith({ serverId: 'srv-done', version: 2 })
    expect(trpc.timers.upsert.mutate).not.toHaveBeenCalled()
  })

  it('cancelled timer calls timers.cancel and is marked synced', async () => {
    // Arrange
    vi.mocked(trpc.timers.reconcile.query).mockResolvedValue({ timers: [], serverNow: '2026-06-08T00:00:00.000Z' })
    const id = await db.timers.add({
      ...BASE_TIMER,
      status: 'cancelled',
      serverId: 'srv-cancelled',
      syncStatus: 'pending',
      version: 3,
    })

    vi.mocked(trpc.timers.cancel.mutate).mockResolvedValueOnce({ ok: true })

    // Act
    renderHook(() => useSyncEngine({ user: USER }))

    // Assert
    await waitFor(async () => {
      const timer = await db.timers.get(id)
      expect(timer?.syncStatus).toBe('synced')
    })
    expect(trpc.timers.cancel.mutate).toHaveBeenCalledWith({ serverId: 'srv-cancelled', version: 3 })
    expect(trpc.timers.upsert.mutate).not.toHaveBeenCalled()
  })

  it('completed timer with no serverId is left pending', async () => {
    // Arrange
    vi.mocked(trpc.timers.reconcile.query).mockResolvedValue({ timers: [], serverNow: '2026-06-08T00:00:00.000Z' })
    const id = await db.timers.add({
      ...BASE_TIMER,
      status: 'completed',
      serverId: null,
      syncStatus: 'pending',
      version: null,
    })

    // Act
    renderHook(() => useSyncEngine({ user: USER }))

    // Assert — still pending after sync settles
    await waitFor(() => expect(trpc.timers.reconcile.query).toHaveBeenCalled())
    const timer = await db.timers.get(id)
    expect(timer?.syncStatus).toBe('pending')
    expect(trpc.timers.complete.mutate).not.toHaveBeenCalled()
    expect(trpc.timers.upsert.mutate).not.toHaveBeenCalled()
  })
})

describe('syncing state', () => {
  it('is false when no sync is running', () => {
    const { result } = renderHook(() => useSyncEngine({ user: null }))
    expect(result.current.syncing).toBe(false)
  })

  it('is true during auto-sync on mount, false after it resolves', async () => {
    let resolveReconcile!: () => void
    const reconcilePromise = new Promise<{ timers: []; serverNow: string }>((res) => {
      resolveReconcile = () => res({ timers: [], serverNow: '2026-06-08T00:00:00.000Z' })
    })
    vi.mocked(trpc.timers.reconcile.query).mockReturnValueOnce(reconcilePromise)

    const { result } = renderHook(() => useSyncEngine({ user: USER }))
    await waitFor(() => expect(result.current.syncing).toBe(true))

    resolveReconcile()
    await waitFor(() => expect(result.current.syncing).toBe(false))
  })

  it('is true while triggerSync is in flight, false after it resolves', async () => {
    let resolveReconcile!: () => void
    const reconcilePromise = new Promise<{ timers: []; serverNow: string }>((res) => {
      resolveReconcile = () => res({ timers: [], serverNow: '2026-06-08T00:00:00.000Z' })
    })
    vi.mocked(trpc.timers.reconcile.query)
      .mockResolvedValueOnce({ timers: [], serverNow: '2026-06-08T00:00:00.000Z' })
      .mockReturnValueOnce(reconcilePromise)

    const { result } = renderHook(() => useSyncEngine({ user: USER }))
    await waitFor(() => expect(trpc.timers.reconcile.query).toHaveBeenCalledTimes(1))

    const syncPromise = result.current.triggerSync()
    await waitFor(() => expect(result.current.syncing).toBe(true))

    resolveReconcile()
    await syncPromise
    await waitFor(() => expect(result.current.syncing).toBe(false))
  })
})

describe('triggerSync', () => {
  it('is a no-op when user is null', async () => {
    const { result } = renderHook(() => useSyncEngine({ user: null }))
    await result.current.triggerSync()
    expect(trpc.timers.reconcile.query).not.toHaveBeenCalled()
    expect(trpc.timers.upsert.mutate).not.toHaveBeenCalled()
  })

  it('adds a server record not present in Dexie without calling upsert', async () => {
    // Let the mount sync settle with an empty reconcile response, then trigger
    vi.mocked(trpc.timers.reconcile.query).mockResolvedValueOnce({ timers: [], serverNow: '2026-06-08T00:00:00.000Z' })
    const { result } = renderHook(() => useSyncEngine({ user: USER }))
    await waitFor(() => expect(trpc.timers.reconcile.query).toHaveBeenCalledTimes(1))

    vi.clearAllMocks()
    vi.mocked(trpc.timers.reconcile.query).mockResolvedValueOnce({
      serverNow: '2026-06-08T00:00:00.000Z',
      timers: [fromPartial({
        id: 'srv-trigger-new',
        title: 'Pulled By triggerSync',
        status: 'active',
        version: 1,
        userId: 'user-1',
      })],
    })

    await result.current.triggerSync()

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
    vi.mocked(trpc.timers.reconcile.query).mockResolvedValueOnce({ timers: [], serverNow: '2026-06-08T00:00:00.000Z' })
    const { result } = renderHook(() => useSyncEngine({ user: USER }))
    await waitFor(() => expect(trpc.timers.reconcile.query).toHaveBeenCalledTimes(1))

    vi.clearAllMocks()
    vi.mocked(trpc.timers.reconcile.query).mockResolvedValueOnce({
      serverNow: '2026-06-08T00:00:00.000Z',
      timers: [fromPartial({
        id: 'srv-stale',
        title: 'Refreshed By triggerSync',
        status: 'active',
        version: 3,
        userId: 'user-1',
      })],
    })

    await result.current.triggerSync()

    const timer = await db.timers.get(id)
    expect(timer?.title).toBe('Refreshed By triggerSync')
    expect(timer?.version).toBe(3)
    expect(trpc.timers.upsert.mutate).not.toHaveBeenCalled()
  })
})

describe('workSessions sync', () => {
  it('drain includes workSessions as ISO strings in the upsert payload', async () => {
    // Arrange — pending timer with two work sessions
    const sessions = [
      { startedAt: new Date('2026-06-01T10:00:00.000Z'), endedAt: new Date('2026-06-01T11:00:00.000Z') },
      { startedAt: new Date('2026-06-01T13:00:00.000Z'), endedAt: null },
    ]
    await db.timers.add({
      ...BASE_TIMER,
      serverId: null,
      syncStatus: 'pending',
      workSessions: sessions,
    })

    vi.mocked(trpc.timers.upsert.mutate).mockResolvedValueOnce(fromPartial({ serverId: 'srv-ws', version: 1 }))
    vi.mocked(trpc.timers.reconcile.query).mockResolvedValueOnce({ timers: [], serverNow: '2026-06-08T00:00:00.000Z' })

    renderHook(() => useSyncEngine({ user: USER }))

    await waitFor(() => expect(trpc.timers.upsert.mutate).toHaveBeenCalled())
    expect(trpc.timers.upsert.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        workSessions: [
          { startedAt: '2026-06-01T10:00:00.000Z', endedAt: '2026-06-01T11:00:00.000Z' },
          { startedAt: '2026-06-01T13:00:00.000Z', endedAt: null },
        ],
      }),
    )
  })

  it('reconcile deserialises workSessions ISO strings to Date objects in Dexie', async () => {
    vi.mocked(trpc.timers.reconcile.query).mockResolvedValueOnce({
      serverNow: '2026-06-08T00:00:00.000Z',
      timers: [fromPartial({
        id: 'srv-ws',
        title: 'With Sessions',
        status: 'active',
        version: 1,
        userId: 'user-1',
        workSessions: [
          { startedAt: '2026-06-01T10:00:00.000Z', endedAt: '2026-06-01T11:00:00.000Z' },
          { startedAt: '2026-06-01T13:00:00.000Z', endedAt: null },
        ],
      })],
    })

    renderHook(() => useSyncEngine({ user: USER }))

    await waitFor(async () => {
      const timers = await db.timers.toArray()
      const timer = timers.find(t => t.serverId === 'srv-ws')
      expect(timer?.workSessions).toHaveLength(2)
      expect(timer?.workSessions[0].startedAt).toBeInstanceOf(Date)
      expect(timer?.workSessions[0].startedAt).toEqual(new Date('2026-06-01T10:00:00.000Z'))
      expect(timer?.workSessions[0].endedAt).toBeInstanceOf(Date)
      expect(timer?.workSessions[0].endedAt).toEqual(new Date('2026-06-01T11:00:00.000Z'))
      expect(timer?.workSessions[1].endedAt).toBeNull()
    })
  })
})

describe('tag drain', () => {
  const BASE_TAG = {
    userId: 'user-1',
    name: 'Work',
    color: '#ff0000',
    emoji: null,
    version: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  it('drains pending tags and marks them synced on success', async () => {
    const id = await db.tags.add({ ...BASE_TAG, serverId: null, syncStatus: 'pending' })

    vi.mocked(trpc.tags.upsert.mutate).mockResolvedValueOnce({ serverId: 'tag-srv', version: 1 })
    vi.mocked(trpc.timers.reconcile.query).mockResolvedValueOnce({ timers: [], serverNow: '2026-06-08T00:00:00.000Z' })

    renderHook(() => useSyncEngine({ user: USER }))

    await waitFor(async () => {
      const tag = await db.tags.get(id)
      expect(tag?.syncStatus).toBe('synced')
      expect(tag?.serverId).toBe('tag-srv')
      expect(tag?.version).toBe(1)
    })
  })

  it('overwrites local tag with server record on CONFLICT', async () => {
    const id = await db.tags.add({ ...BASE_TAG, serverId: 'tag-existing', syncStatus: 'pending', version: 1 })

    const conflictError = new TRPCClientError('Conflict', {
      result: { error: { data: { code: 'CONFLICT' }, message: 'Conflict', code: -32600 } },
    })
    vi.mocked(trpc.tags.upsert.mutate).mockRejectedValueOnce(conflictError)
    vi.mocked(trpc.tags.reconcile.query)
      .mockResolvedValueOnce({
        tags: [fromPartial({
          id: 'tag-existing',
          name: 'Server Name',
          color: '#ffffff',
          emoji: null,
          version: 5,
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        })],
        serverNow: '2026-06-08T00:00:00.000Z',
      })
      .mockResolvedValueOnce(EMPTY_TAGS_RECONCILE)
    vi.mocked(trpc.timers.reconcile.query).mockResolvedValueOnce({ timers: [], serverNow: '2026-06-08T00:00:00.000Z' })

    renderHook(() => useSyncEngine({ user: USER }))

    await waitFor(async () => {
      const tag = await db.tags.get(id)
      expect(tag?.name).toBe('Server Name')
      expect(tag?.syncStatus).toBe('synced')
      expect(tag?.version).toBe(5)
    })
    // Wait for the full sync cycle (including reconcileAll) to finish so it doesn't
    // leak into the next test via the module-level syncRunning flag or consumed mocks.
    await waitFor(() => expect(localStorage.getItem('cw:lastSyncedAt')).not.toBeNull())
  })
})

describe('tag delete drain', () => {
  const BASE_TAG = {
    userId: 'user-1',
    name: 'Work',
    color: '#ff0000',
    emoji: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  it('drains a deleted tag: calls server delete then hard-deletes from Dexie', async () => {
    const id = await db.tags.add({ ...BASE_TAG, serverId: 'tag-srv-1', syncStatus: SyncStatuses.Deleted })

    vi.mocked(trpc.tags.delete.mutate).mockResolvedValueOnce({ ok: true })
    vi.mocked(trpc.timers.reconcile.query).mockResolvedValueOnce({ timers: [], serverNow: '2026-06-08T00:00:00.000Z' })

    renderHook(() => useSyncEngine({ user: USER }))

    await waitFor(async () => {
      const tag = await db.tags.get(id)
      expect(tag).toBeUndefined()
    })
  })

  it('failed drain leaves tag as deleted for retry', async () => {
    const id = await db.tags.add({ ...BASE_TAG, serverId: 'tag-srv-2', syncStatus: SyncStatuses.Deleted })

    vi.mocked(trpc.tags.delete.mutate).mockRejectedValueOnce(new Error('network error'))
    vi.mocked(trpc.timers.reconcile.query).mockResolvedValueOnce({ timers: [], serverNow: '2026-06-08T00:00:00.000Z' })

    renderHook(() => useSyncEngine({ user: USER }))

    await waitFor(async () => {
      const tag = await db.tags.get(id)
      expect(tag?.syncStatus).toBe(SyncStatuses.Deleted)
    })
  })

  it('reconcile skips resurrection when local deletion timestamp >= server updatedAt', async () => {
    const localDeletedAt = new Date('2026-06-10T12:00:00.000Z')
    const id = await db.tags.add({
      ...BASE_TAG,
      serverId: 'tag-srv-3',
      syncStatus: SyncStatuses.Deleted,
      updatedAt: localDeletedAt,
    })

    // Drain fails so tag stays in Dexie as 'deleted' for reconcile to evaluate
    vi.mocked(trpc.tags.delete.mutate).mockRejectedValueOnce(new Error('network error'))
    vi.mocked(trpc.timers.reconcile.query).mockResolvedValueOnce({ timers: [], serverNow: '2026-06-14T00:00:00.000Z' })
    vi.mocked(trpc.tags.reconcile.query).mockResolvedValueOnce({
      tags: [fromPartial({
        id: 'tag-srv-3',
        name: 'Work',
        version: 1,
        updatedAt: '2026-06-09T00:00:00.000Z', // older than local deletion
      })],
      serverNow: '2026-06-14T00:00:00.000Z',
    })

    renderHook(() => useSyncEngine({ user: USER }))

    await waitFor(() => expect(trpc.tags.reconcile.query).toHaveBeenCalledTimes(1))
    const tag = await db.tags.get(id)
    // Must still exist as deleted — not resurrected
    expect(tag?.syncStatus).toBe(SyncStatuses.Deleted)
    expect(tag?.name).toBe('Work') // original name preserved
  })
})

describe('reconcile call shape', () => {
  it('on cold start, sends only active/fired timers with a serverId in records', async () => {
    // Arrange — no lastSyncedAt in localStorage
    await db.timers.bulkAdd([
      { ...BASE_TIMER, serverId: 'srv-active', syncStatus: 'synced', version: 1, status: 'active' },
      { ...BASE_TIMER, serverId: 'srv-fired', syncStatus: 'synced', version: 1, status: 'fired' },
      { ...BASE_TIMER, serverId: 'srv-completed', syncStatus: 'synced', version: 1, status: 'completed' },
      { ...BASE_TIMER, serverId: 'srv-cancelled', syncStatus: 'synced', version: 1, status: 'cancelled' },
      { ...BASE_TIMER, serverId: 'srv-missed', syncStatus: 'synced', version: 1, status: 'missed' },
      { ...BASE_TIMER, serverId: null, syncStatus: 'pending', version: null, status: 'active' },
    ])
    vi.mocked(trpc.timers.reconcile.query).mockResolvedValueOnce({ timers: [], serverNow: '2026-06-08T00:00:00.000Z' })

    // Act
    renderHook(() => useSyncEngine({ user: USER }))

    // Assert
    await waitFor(() => expect(trpc.timers.reconcile.query).toHaveBeenCalledTimes(1))
    expect(trpc.timers.reconcile.query).toHaveBeenCalledWith(
      expect.objectContaining({
        records: expect.arrayContaining([
          expect.objectContaining({ serverId: 'srv-active' }),
          expect.objectContaining({ serverId: 'srv-fired' }),
        ]),
      }),
    )
    const callArgs = vi.mocked(trpc.timers.reconcile.query).mock.calls[0][0]
    const sentIds = callArgs.records.map((r: { serverId: string }) => r.serverId)
    expect(sentIds).not.toContain('srv-completed')
    expect(sentIds).not.toContain('srv-cancelled')
    expect(sentIds).not.toContain('srv-missed')
    expect(sentIds).not.toContain(null)
  })

  it('stores serverNow as lastSyncedAt after a successful reconcile', async () => {
    // Arrange
    const serverNow = '2026-06-08T12:34:56.000Z'
    vi.mocked(trpc.timers.reconcile.query).mockResolvedValueOnce({ timers: [], serverNow })

    // Act
    renderHook(() => useSyncEngine({ user: USER }))

    // Assert
    await waitFor(() => expect(trpc.timers.reconcile.query).toHaveBeenCalledTimes(1))
    expect(localStorage.getItem('cw:lastSyncedAt')).toBe(serverNow)
  })

  it('sends records: [] when lastSyncedAt is already set', async () => {
    // Arrange
    localStorage.setItem('cw:lastSyncedAt', '2026-06-01T00:00:00.000Z')
    await db.timers.add({ ...BASE_TIMER, serverId: 'srv-1', syncStatus: 'synced', version: 1 })
    vi.mocked(trpc.timers.reconcile.query).mockResolvedValueOnce({ timers: [], serverNow: '2026-06-08T00:00:00.000Z' })

    // Act
    renderHook(() => useSyncEngine({ user: USER }))

    // Assert
    await waitFor(() => expect(trpc.timers.reconcile.query).toHaveBeenCalledTimes(1))
    expect(trpc.timers.reconcile.query).toHaveBeenCalledWith(
      expect.objectContaining({ records: [] }),
    )
  })
})

describe('tag deletion drain', () => {
  it('calls trpc.tags.delete for a deleted synced tag then hard-deletes it from Dexie', async () => {
    const id = await db.tags.add({
      serverId: 'srv-tag-1',
      userId: 'user-1',
      name: 'Work',
      color: '#3b82f6',
      emoji: null,
      version: 1,
      syncStatus: SyncStatuses.Deleted,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    vi.mocked(trpc.tags.delete.mutate).mockResolvedValueOnce({ ok: true })

    renderHook(() => useSyncEngine({ user: USER }))

    await waitFor(async () => {
      const tag = await db.tags.get(id)
      expect(tag).toBeUndefined()
    })
    expect(trpc.tags.delete.mutate).toHaveBeenCalledWith({ serverId: 'srv-tag-1' })
  })
})
