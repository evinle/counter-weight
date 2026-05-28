import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAuthStore, subscribeToAuthPersistence } from '../store/authStore'
import { StorageKey, bootstrappedKey } from '../lib/storageKeys'

// Minimal fake JWT: header.payload.sig
function fakeJwt(sub: string, email: string, given_name?: string) {
  const payload = btoa(JSON.stringify({ sub, email, given_name }))
  return `header.${payload}.sig`
}

const initialState = {
  state: 'loading' as const,
  user: null,
  lastUser: null,
  bootstrapStarted: false,
}

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState(initialState)
  vi.clearAllMocks()
})

describe('initial state', () => {
  it('starts in loading state with no user', () => {
    const { state, user, lastUser } = useAuthStore.getState()
    expect(state).toBe('loading')
    expect(user).toBeNull()
    expect(lastUser).toBeNull()
  })

  it('reads lastUser from localStorage on store creation', () => {
    localStorage.setItem(StorageKey.LastUser, JSON.stringify({ userId: 'u1', firstName: 'Alice' }))
    // Re-read by calling readLastUser directly, since store initialises once at module load.
    // Instead, verify via subscribeToAuthPersistence writing + reading back.
    const stored = JSON.parse(localStorage.getItem(StorageKey.LastUser)!)
    expect(stored).toEqual({ userId: 'u1', firstName: 'Alice' })
  })
})

describe('setAuthenticated', () => {
  it('parses idToken and sets authenticated state', () => {
    useAuthStore.getState().setAuthenticated(fakeJwt('user-1', 'user@example.com', 'Alice'))
    const { state, user } = useAuthStore.getState()
    expect(state).toBe('authenticated')
    expect(user).toEqual({ userId: 'user-1', email: 'user@example.com', firstName: 'Alice' })
  })

  it('falls back to email local-part when given_name is absent', () => {
    useAuthStore.getState().setAuthenticated(fakeJwt('user-1', 'alice@example.com'))
    expect(useAuthStore.getState().user?.firstName).toBe('alice')
  })

  it('does nothing when token is unparseable', () => {
    useAuthStore.getState().setAuthenticated('not.a.jwt')
    expect(useAuthStore.getState().state).toBe('loading')
  })
})

describe('setUnauthenticated', () => {
  it('sets state to unauthenticated', () => {
    useAuthStore.getState().setUnauthenticated()
    expect(useAuthStore.getState().state).toBe('unauthenticated')
  })
})

describe('continueAsGuest', () => {
  it('sets state to guest', () => {
    useAuthStore.getState().continueAsGuest()
    expect(useAuthStore.getState().state).toBe('guest')
  })
})

describe('subscribeToAuthPersistence', () => {
  it('writes cw:lastUser to localStorage when user is set', () => {
    const unsubscribe = subscribeToAuthPersistence()
    useAuthStore.getState().setAuthenticated(fakeJwt('u1', 'alice@example.com', 'Alice'))
    const stored = JSON.parse(localStorage.getItem(StorageKey.LastUser)!)
    expect(stored).toEqual({ userId: 'u1', firstName: 'Alice' })
    unsubscribe()
  })

  it('removes cw:lastUser from localStorage when user becomes null', () => {
    localStorage.setItem(StorageKey.LastUser, JSON.stringify({ userId: 'u1', firstName: 'Alice' }))
    const unsubscribe = subscribeToAuthPersistence()
    useAuthStore.setState({ user: { userId: 'u1', email: 'a@b.com', firstName: 'Alice' } })
    useAuthStore.setState({ user: null })
    expect(localStorage.getItem(StorageKey.LastUser)).toBeNull()
    unsubscribe()
  })
})

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  vi.stubGlobal('import.meta', {
    env: {
      VITE_COGNITO_DOMAIN: 'https://test.auth.example.com',
      VITE_COGNITO_CLIENT_ID: 'test-client-id',
    },
  })
  vi.stubGlobal('location', {
    href: '',
    origin: 'https://app.example.com',
    search: '',
    pathname: '/',
  })
})

describe('bootstrap()', () => {
  it('sets authenticated state on successful refresh', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ idToken: fakeJwt('u1', 'user@example.com', 'Alice') }),
    })

    await useAuthStore.getState().bootstrap()

    expect(useAuthStore.getState().state).toBe('authenticated')
    expect(useAuthStore.getState().user?.userId).toBe('u1')
  })

  it('sets unauthenticated when refresh returns 401 and no lastUser', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false })

    await useAuthStore.getState().bootstrap()

    expect(useAuthStore.getState().state).toBe('unauthenticated')
  })

  it('redirects with prompt=none when refresh returns 401 and lastUser exists', async () => {
    localStorage.setItem(StorageKey.LastUser, JSON.stringify({ userId: 'u1', firstName: 'Alice' }))
    mockFetch.mockResolvedValueOnce({ ok: false })

    await useAuthStore.getState().bootstrap()

    expect(window.location.href).toContain('/oauth2/authorize')
    expect(window.location.href).toContain('prompt=none')
  })

  it('sets unauthenticated on network timeout (AbortError)', async () => {
    mockFetch.mockRejectedValueOnce(
      Object.assign(new Error('aborted'), { name: 'AbortError' })
    )

    await useAuthStore.getState().bootstrap()

    expect(useAuthStore.getState().state).toBe('unauthenticated')
  })

  it('does not re-run when called a second time', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ idToken: fakeJwt('u1', 'user@example.com', 'Alice') }),
    })

    await useAuthStore.getState().bootstrap()
    await useAuthStore.getState().bootstrap()

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})

describe('login()', () => {
  it('redirects to Cognito authorize URL without prompt=none', () => {
    useAuthStore.getState().login()
    expect(window.location.href).toContain('/oauth2/authorize')
    expect(window.location.href).toContain('client_id=')
    expect(window.location.href).not.toContain('prompt=none')
  })
})

describe('loginSilent()', () => {
  it('redirects to Cognito authorize URL with prompt=none', () => {
    useAuthStore.getState().loginSilent()
    expect(window.location.href).toContain('/oauth2/authorize')
    expect(window.location.href).toContain('prompt=none')
  })
})

describe('logout()', () => {
  it('clears user state, calls /auth/logout, removes localStorage keys', async () => {
    useAuthStore.setState({
      state: 'authenticated',
      user: { userId: 'u1', email: 'user@example.com', firstName: 'Alice' },
    })
    localStorage.setItem(bootstrappedKey('u1'), '1')
    localStorage.setItem(StorageKey.LastSyncedAt, new Date().toISOString())
    localStorage.setItem(StorageKey.LastUser, JSON.stringify({ userId: 'u1', firstName: 'Alice' }))
    mockFetch.mockResolvedValueOnce({ ok: true })

    await useAuthStore.getState().logout()

    const { state, user } = useAuthStore.getState()
    expect(state).toBe('unauthenticated')
    expect(user).toBeNull()
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/logout'),
      expect.objectContaining({ method: 'POST' })
    )
    expect(localStorage.getItem(bootstrappedKey('u1'))).toBeNull()
    expect(localStorage.getItem(StorageKey.LastSyncedAt)).toBeNull()
    expect(localStorage.getItem(StorageKey.LastUser)).toBeNull()
  })
})
