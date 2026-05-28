import { create } from 'zustand'
import { fetchFromBackend } from '../lib/api'
import { setIdToken } from '../lib/trpc'
import { StorageKey, bootstrappedKey, readLastUser } from '../lib/storageKeys'
import type { LastUser } from '../lib/storageKeys'

export type AuthState = 'loading' | 'unauthenticated' | 'authenticated' | 'guest'

export interface AuthUser {
  userId: string
  email: string
  firstName: string
}

interface AuthStore {
  state: AuthState
  user: AuthUser | null
  lastUser: LastUser | null
  bootstrapStarted: boolean

  bootstrap: () => Promise<void>
  login: () => void
  loginSilent: () => void
  continueAsGuest: () => void
  logout: () => Promise<void>
  setAuthenticated: (idToken: string) => void
  setUnauthenticated: () => void
}

function parseJwtClaims(token: string): { sub: string; email: string; given_name?: string } | null {
  try {
    const base64Url = token.split('.')[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const payload = JSON.parse(atob(padded)) as Record<string, unknown>
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') return null
    return {
      sub: payload.sub,
      email: payload.email,
      given_name: typeof payload.given_name === 'string' ? payload.given_name : undefined,
    }
  } catch {
    return null
  }
}

function buildCognitoUrl(extra?: Record<string, string>): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: import.meta.env.VITE_COGNITO_CLIENT_ID as string,
    redirect_uri: `${window.location.origin}/auth/callback`,
    scope: 'email openid profile',
    ...extra,
  })
  return `${import.meta.env.VITE_COGNITO_DOMAIN as string}/oauth2/authorize?${params}`
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  state: 'loading',
  user: null,
  lastUser: readLastUser(),
  bootstrapStarted: false,

  setAuthenticated: (idToken) => {
    const claims = parseJwtClaims(idToken)
    if (!claims) return
    const firstName = claims.given_name ?? claims.email.split('@')[0]
    setIdToken(idToken)
    set({ state: 'authenticated', user: { userId: claims.sub, email: claims.email, firstName } })
  },

  setUnauthenticated: () => set({ state: 'unauthenticated' }),

  continueAsGuest: () => set({ state: 'guest' }),

  login: () => { window.location.href = buildCognitoUrl() },

  loginSilent: () => { window.location.href = buildCognitoUrl({ prompt: 'none' }) },

  bootstrap: async () => {
    if (get().bootstrapStarted) return
    set({ bootstrapStarted: true })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)

    try {
      const res = await fetchFromBackend('/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        signal: controller.signal,
      })
      clearTimeout(timeout)
      if (res.ok) {
        const { idToken } = (await res.json()) as { idToken: string }
        get().setAuthenticated(idToken)
      } else {
        const lastUser = readLastUser()
        if (lastUser) {
          get().loginSilent()
        } else {
          set({ state: 'unauthenticated' })
        }
      }
    } catch {
      clearTimeout(timeout)
      set({ state: 'unauthenticated' })
    }
  },

  logout: async () => {
    const { user } = get()
    if (user) {
      await fetchFromBackend('/auth/logout', { method: 'POST', credentials: 'include' })
      localStorage.removeItem(bootstrappedKey(user.userId))
    }
    localStorage.removeItem(StorageKey.LastSyncedAt)
    localStorage.removeItem(StorageKey.LastUser)
    setIdToken(null)
    set({ user: null, state: 'unauthenticated' })
  },
}))

export function subscribeToAuthPersistence(): () => void {
  return useAuthStore.subscribe((state, prev) => {
    if (state.user === prev.user) return
    if (state.user) {
      const entry: LastUser = { userId: state.user.userId, firstName: state.user.firstName }
      localStorage.setItem(StorageKey.LastUser, JSON.stringify(entry))
    } else {
      localStorage.removeItem(StorageKey.LastUser)
    }
  })
}
