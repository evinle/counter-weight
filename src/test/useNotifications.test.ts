import { renderHook, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useNotifications } from '../hooks/useNotifications.js'
import type { AuthUser } from '../hooks/useAuth.js'

// jsdom doesn't include Notification — stub it globally for these tests
const mockRequestPermission = vi.fn<[], Promise<NotificationPermission>>()
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

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'test-vapid-key')
  mockPermission = 'default'
})

describe('useNotifications', () => {
  it('requests permission and calls register on grant', async () => {
    mockRequestPermission.mockResolvedValue('granted')
    const { mockSubscribe } = mockPushManager('default')

    renderHook(() => useNotifications({ user: USER }))

    await waitFor(() => {
      expect(trpc.pushSubscriptions.register.mutate).toHaveBeenCalledWith({
        endpoint: PUSH_SUBSCRIPTION_JSON.endpoint,
        p256dh: PUSH_SUBSCRIPTION_JSON.keys.p256dh,
        auth: PUSH_SUBSCRIPTION_JSON.keys.auth,
      })
    })
    expect(mockSubscribe).toHaveBeenCalledOnce()
  })

  it('calls register on mount when permission already granted', async () => {
    const { mockSubscribe } = mockPushManager('granted')

    renderHook(() => useNotifications({ user: USER }))

    await waitFor(() => {
      expect(trpc.pushSubscriptions.register.mutate).toHaveBeenCalledOnce()
    })
    expect(mockRequestPermission).not.toHaveBeenCalled()
    expect(mockSubscribe).toHaveBeenCalledOnce()
  })

  it('skips entirely for guest users', async () => {
    mockPushManager('default')

    renderHook(() => useNotifications({ user: null }))

    await new Promise(r => setTimeout(r, 50))
    expect(mockRequestPermission).not.toHaveBeenCalled()
    expect(trpc.pushSubscriptions.register.mutate).not.toHaveBeenCalled()
  })
})
