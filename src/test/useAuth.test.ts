import { renderHook, act, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useAuth } from '../hooks/useAuth'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Minimal fake JWT: header.payload.sig where payload has sub and email
function fakeJwt(sub: string, email: string) {
  const payload = btoa(JSON.stringify({ sub, email }))
  return `header.${payload}.sig`
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('import.meta', {
    env: {
      VITE_COGNITO_DOMAIN: 'https://test.auth.us-east-1.amazoncognito.com',
      VITE_COGNITO_CLIENT_ID: 'test-client-id',
    },
  })
})

describe('useAuth', () => {
  it('starts in loading state, transitions to authenticated after successful silent refresh', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ idToken: fakeJwt('user-sub', 'user@example.com') }),
    })

    const { result } = renderHook(() => useAuth())

    expect(result.current.state).toBe('loading')

    await waitFor(() => expect(result.current.state).toBe('authenticated'))

    expect(result.current.user?.userId).toBe('user-sub')
    expect(result.current.user?.email).toBe('user@example.com')
  })

  it('transitions to unauthenticated when silent refresh returns 401', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false })

    const { result } = renderHook(() => useAuth())

    await waitFor(() => expect(result.current.state).toBe('unauthenticated'))
    expect(result.current.user).toBeNull()
  })

  it('transitions to unauthenticated on refresh timeout (AbortError)', async () => {
    mockFetch.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }))

    const { result } = renderHook(() => useAuth())

    await waitFor(() => expect(result.current.state).toBe('unauthenticated'))
  })

  it('logout clears user state, calls /auth/logout, and removes lastSyncedAt', async () => {
    localStorage.setItem('cw:lastSyncedAt', new Date().toISOString())
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ idToken: fakeJwt('user-sub', 'user@example.com') }),
      })
      .mockResolvedValueOnce({ ok: true }) // logout call

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.state).toBe('authenticated'))

    await act(async () => { await result.current.logout() })

    expect(result.current.state).toBe('unauthenticated')
    expect(result.current.user).toBeNull()
    expect(mockFetch).toHaveBeenCalledWith('/auth/logout', expect.objectContaining({ method: 'POST' }))
    expect(localStorage.getItem('cw:lastSyncedAt')).toBeNull()
  })
})
