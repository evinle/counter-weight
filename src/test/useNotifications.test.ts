import 'fake-indexeddb/auto'
import { act, renderHook, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useNotifications } from '../hooks/useNotifications.js'
import { useTimerStore } from '../store/timerStore.js'
import { useToastStore } from '../hooks/useToast.js'
import type { AuthUser } from '../hooks/useAuth.js'
import type { Timer } from '../db/schema.js'

// jsdom doesn't include Notification — stub it globally for these tests
const mockRequestPermission = vi.fn<() => Promise<NotificationPermission>>()
let mockPermission: NotificationPermission = 'default'

Object.defineProperty(global, 'Notification', {
  value: {
    requestPermission: mockRequestPermission,
    get permission() { return mockPermission },
  },
  writable: true,
  configurable: true,
})

vi.mock('../lib/trpc', () => ({
  trpc: {
    pushSubscriptions: {
      register: { mutate: vi.fn() },
    },
  },
  idToken: 'mock-token',
  setIdToken: vi.fn(),
}))

import { trpc } from '../lib/trpc.js'

const USER = { userId: 'user-1', email: 'user@example.com', firstName: 'Test' } satisfies AuthUser

const PUSH_SUBSCRIPTION_JSON = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
  keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtbTTSZl', auth: 'tBHItJI5svbpez7KI4CCXg' },
}

function mockPushManager(permission: NotificationPermission, subscription = PUSH_SUBSCRIPTION_JSON) {
  mockPermission = permission
  const mockSubscribe = vi.fn().mockResolvedValue({ toJSON: () => subscription })
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { ready: Promise.resolve({ pushManager: { subscribe: mockSubscribe } }) },
    writable: true,
    configurable: true,
  })
  return { mockSubscribe }
}

const FIRED_TIMER = {
  id: 1,
  title: 'Standup',
  emoji: '📅',
  description: null,
  targetDatetime: new Date('2026-06-07T09:00:00.000Z'),
  originalTargetDatetime: new Date('2026-06-07T09:00:00.000Z'),
  status: 'fired',
  priority: 'medium',
  recurrenceRule: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  serverId: null,
  userId: null,
  syncStatus: 'synced',
  version: null,
} satisfies Timer

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'test-vapid-key')
  mockPermission = 'default'
  useTimerStore.setState({ firedTimer: null, activeTimers: [] })
  useToastStore.setState({ toasts: [] })
})

describe('useNotifications', () => {
  it('registers subscription after user grants permission via requestPermission', async () => {
    // Arrange
    mockRequestPermission.mockResolvedValue('granted')
    const { mockSubscribe } = mockPushManager('default')
    const { result } = renderHook(() => useNotifications({ user: USER }))

    // Act
    act(() => { result.current.requestPermission() })

    // Assert
    await waitFor(() => {
      expect(trpc.pushSubscriptions.register.mutate).toHaveBeenCalledWith({
        endpoint: PUSH_SUBSCRIPTION_JSON.endpoint,
        p256dh: PUSH_SUBSCRIPTION_JSON.keys.p256dh,
        auth: PUSH_SUBSCRIPTION_JSON.keys.auth,
      })
    })
    expect(mockSubscribe).toHaveBeenCalledOnce()
  })

  it('does not request permission automatically on mount', () => {
    // Arrange + Act
    mockPushManager('default')
    renderHook(() => useNotifications({ user: USER }))

    // Assert — no prompt fires without user interaction
    expect(mockRequestPermission).not.toHaveBeenCalled()
  })

  it('registers subscription on mount when permission already granted', async () => {
    // Arrange + Act
    const { mockSubscribe } = mockPushManager('granted')
    renderHook(() => useNotifications({ user: USER }))

    // Assert
    await waitFor(() => {
      expect(trpc.pushSubscriptions.register.mutate).toHaveBeenCalledOnce()
    })
    expect(mockRequestPermission).not.toHaveBeenCalled()
    expect(mockSubscribe).toHaveBeenCalledOnce()
  })

  it('prompts for permission but skips registration for guest users', async () => {
    // Arrange
    mockRequestPermission.mockResolvedValue('granted')
    mockPushManager('default')
    const { result } = renderHook(() => useNotifications({ user: null }))

    // Act
    act(() => { result.current.requestPermission() })

    // Assert — browser prompt fires, but subscription is never registered without a user
    await waitFor(() => {
      expect(mockRequestPermission).toHaveBeenCalledOnce()
    })
    expect(trpc.pushSubscriptions.register.mutate).not.toHaveBeenCalled()
  })
})

describe('useNotifications firedTimer handling', () => {
  it('shows toast when firedTimer fires and notifications not granted', async () => {
    // Arrange
    mockPermission = 'default'
    renderHook(() => useNotifications({ user: USER }))

    // Act
    act(() => { useTimerStore.setState({ firedTimer: FIRED_TIMER }) })

    // Assert
    await waitFor(() => {
      expect(useToastStore.getState().toasts).toHaveLength(1)
    })
    expect(useToastStore.getState().toasts[0].message).toContain('Standup')
  })

  it('clears firedTimer after handling', async () => {
    // Arrange
    mockPermission = 'default'
    renderHook(() => useNotifications({ user: USER }))

    // Act
    act(() => { useTimerStore.setState({ firedTimer: FIRED_TIMER }) })

    // Assert
    await waitFor(() => {
      expect(useTimerStore.getState().firedTimer).toBeNull()
    })
  })
})
