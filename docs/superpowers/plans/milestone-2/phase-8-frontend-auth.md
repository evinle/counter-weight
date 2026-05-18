# Phase 8: Frontend Auth [CODEBASE]

> Back to [index](index.md)

## Prior Phase Context

**From Phase 5 (API Lambda):** The `AppRouter` type is exported from `server/api/index.ts`. The tRPC client imports this type for end-to-end type safety:

```typescript
import type { AppRouter } from '../../server/api/index'
// AppRouter shape:
// {
//   auth: { bootstrap: mutation({ email }) → { ok: true } }
//   timers: {
//     list: query() → Timer[]
//     get: query({ serverId }) → Timer | null
//     upsert: mutation({ serverId, title, ... }) → { serverId, version }
//     complete: mutation({ serverId, version }) → { ok: true }
//     cancel: mutation({ serverId, version }) → { ok: true }
//     reconcile: query({ since, records }) → Timer[]
//   }
// }
```

**From Phase 7 (Dexie migration):** The `Timer` type in `src/db/schema.ts` now has:
- `serverId: string | null`
- `userId: string | null`
- `syncStatus: 'pending' | 'synced'`
- `version: number | null`

**Frontend dependencies** (added in Phase 1, Task 1.3):
- `@tanstack/react-query@^5`
- `@trpc/client@^11`
- `@trpc/react-query@^11`
- `zod@^3.23`

**Vite env vars needed** (add to `.env.local`):
```
VITE_COGNITO_DOMAIN=https://counter-weight-auth.auth.<region>.amazoncognito.com
VITE_COGNITO_CLIENT_ID=<UserPoolClientId from Phase 6 outputs>
```

**Auth flow summary:**
1. `useAuth` fires `POST /auth/refresh` on mount (3s timeout) — sets `idToken` in-memory via `setIdToken()`, never in localStorage
2. On success → `state: 'authenticated'`; on failure → `state: 'unauthenticated'` → shows `LoginView`
3. `LoginView.onLogin()` redirects to Cognito Hosted UI
4. Cognito redirects back to `/auth/callback?code=...`
5. `App.tsx` detects `?code` param, POSTs to `/auth/callback`, gets `idToken`, calls `window.location.reload()`
6. Reload triggers `useAuth` again → authenticated

---

## Task 8.1: tRPC client

**Files:**
- Create: `src/lib/trpc.ts`

The tRPC client injects the Bearer token and retries once on 401 by calling `/auth/refresh`.

- [ ] **Create `src/lib/trpc.ts`**

```typescript
import { createTRPCClient, httpBatchLink } from '@trpc/client'
import type { AppRouter } from '../../server/api/index'

export let idToken: string | null = null

export function setIdToken(token: string | null) {
  idToken = token
}

// Module-level singleton: if 10 tRPC calls all 401 simultaneously, they share
// one refresh request instead of triggering 10 concurrent Cognito calls
// (which would each get a rotated refresh token, invalidating all but the last).
let refreshPromise: Promise<string | null> | null = null

async function doRefresh(): Promise<string | null> {
  const refreshRes = await fetch('/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  })
  if (!refreshRes.ok) { setIdToken(null); return null }
  const { idToken: newToken } = (await refreshRes.json()) as { idToken: string }
  setIdToken(newToken)
  return newToken
}

async function refreshAndRetry(url: RequestInfo, options: RequestInit): Promise<Response> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => { refreshPromise = null })
  }
  const newToken = await refreshPromise
  if (!newToken) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const headers = new Headers(options.headers)
  headers.set('Authorization', `Bearer ${newToken}`)
  return fetch(url, { ...options, headers })
}

async function fetchWithAuth(url: RequestInfo, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, options)
  if (res.status === 401 && idToken) return refreshAndRetry(url, options)
  return res
}

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: '/trpc',
      fetch: fetchWithAuth,
      headers() {
        return idToken ? { Authorization: `Bearer ${idToken}` } : {}
      },
    }),
  ],
})
```

- [ ] **Commit**

```bash
git add src/lib/trpc.ts
git commit -m "feat(frontend): add tRPC client with Bearer token + 401 retry"
```

---

## Task 8.2: useAuth hook (with test)

**Files:**
- Create: `src/hooks/useAuth.ts`
- Create: `src/test/useAuth.test.ts`

- [ ] **Write the failing tests**

Create `src/test/useAuth.test.ts`:

```typescript
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
```

- [ ] **Run — expect FAIL (module not found)**

```bash
npx vitest run src/test/useAuth.test.ts
```

- [ ] **Create `src/hooks/useAuth.ts`**

```typescript
import { useState, useEffect, useRef } from 'react'
import { setIdToken } from '../lib/trpc'

export type AuthState = 'loading' | 'unauthenticated' | 'authenticated'

export interface AuthUser {
  userId: string
  email: string
}

export interface UseAuth {
  state: AuthState
  user: AuthUser | null
  login: () => void
  logout: () => Promise<void>
}

function parseJwt(token: string): AuthUser | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return { userId: payload.sub, email: payload.email }
  } catch {
    return null
  }
}

export function useAuth(): UseAuth {
  const [state, setState] = useState<AuthState>('loading')
  const [user, setUser] = useState<AuthUser | null>(null)
  const mounted = useRef(false)

  useEffect(() => {
    if (mounted.current) return
    mounted.current = true

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)

    fetch('/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (res) => {
        clearTimeout(timeout)
        if (!res.ok) { setState('unauthenticated'); return }
        const { idToken } = (await res.json()) as { idToken: string }
        setIdToken(idToken)
        const u = parseJwt(idToken)
        setUser(u)
        setState(u ? 'authenticated' : 'unauthenticated')
      })
      .catch(() => {
        clearTimeout(timeout)
        setState('unauthenticated')
      })
  }, [])

  function login() {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: import.meta.env.VITE_COGNITO_CLIENT_ID,
      redirect_uri: `${window.location.origin}/auth/callback`,
      scope: 'email openid profile',
    })
    window.location.href = `${import.meta.env.VITE_COGNITO_DOMAIN}/oauth2/authorize?${params}`
  }

  async function logout() {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' })
    setIdToken(null)
    setUser(null)
    setState('unauthenticated')
    localStorage.removeItem('cw:lastSyncedAt')
  }

  return { state, user, login, logout }
}
```

- [ ] **Run tests — expect PASS**

```bash
npx vitest run src/test/useAuth.test.ts
```

- [ ] **Commit**

```bash
git add src/hooks/useAuth.ts src/test/useAuth.test.ts
git commit -m "feat(frontend): add useAuth hook with 3s silent refresh timeout"
```

---

## Task 8.3: LoginView component

**Files:**
- Create: `src/components/LoginView.tsx`

- [ ] **Create `src/components/LoginView.tsx`**

```tsx
interface LoginViewProps {
  onLogin: () => void
}

export function LoginView({ onLogin }: LoginViewProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-8 px-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white mb-2">Counter Weight</h1>
        <p className="text-slate-400 text-sm">Sign in to sync your timers across devices</p>
      </div>

      <div className="w-full max-w-xs flex flex-col gap-3">
        <button
          onClick={onLogin}
          className="w-full flex items-center justify-center gap-3 bg-white text-slate-900 font-semibold py-3 px-6 rounded-xl active:scale-95 transition-all cursor-pointer"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Sign in with Google
        </button>
      </div>

      <p className="text-slate-600 text-xs text-center">
        Your timers are stored locally and sync when you're online
      </p>
    </div>
  )
}
```

- [ ] **Commit**

```bash
git add src/components/LoginView.tsx
git commit -m "feat(frontend): add LoginView component"
```

---

## Task 8.4: App.tsx — auth gate + QueryClientProvider

**Files:**
- Modify: `src/App.tsx`

- [ ] **Add auth handling and the callback route to `src/App.tsx`**

Add these imports at the top:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from './hooks/useAuth'
import { LoginView } from './components/LoginView'
import { trpc, setIdToken } from './lib/trpc'
```

Add `const queryClient = new QueryClient()` above the `App` function.

Wrap the return value in `<QueryClientProvider client={queryClient}>`.

Inside `App`, add auth handling:

```tsx
const { state, user, login } = useAuth()

// Handle Cognito auth callback
useEffect(() => {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  if (!code) return

  window.history.replaceState({}, '', window.location.pathname)

  fetch('/auth/callback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ code, origin: window.location.origin }),
  })
    .then(async (res) => {
      if (!res.ok) return
      const { idToken } = await res.json() as { idToken: string }
      // Reload triggers useAuth's silent refresh, which restores authenticated state.
      // Known limitation (M2): causes a visible roundtrip. Fixing cleanly requires a
      // shared auth store so the callback can update auth state in place. Defer to M3.
      setIdToken(idToken)
      window.location.reload()
    })
}, [])
```

In `renderContent()`, add the auth gate before the existing switch:

```tsx
if (state === 'loading') {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-slate-600 border-t-slate-300 rounded-full animate-spin" />
    </div>
  )
}

if (state === 'unauthenticated') {
  return <LoginView onLogin={login} />
}
```

Also: after login is confirmed, call `auth.bootstrap`. The `users` row must exist before any timer mutation (FK constraint), so log and retry once on failure:

```tsx
useEffect(() => {
  if (state !== 'authenticated' || !user) return

  function bootstrap(attempt = 0) {
    trpc.auth.bootstrap
      .mutate({ email: user!.email })
      .catch((err) => {
        console.error('[bootstrap] failed:', err)
        if (attempt < 1) setTimeout(() => bootstrap(attempt + 1), 2000)
      })
  }

  bootstrap()
}, [state, user?.userId])
```

- [ ] **Run full test suite**

```bash
npx vitest run
```

- [ ] **Start dev server and verify login page renders**

```bash
npm run dev
```

Navigate to `http://localhost:5174` — should show the LoginView (since no refresh token exists yet).

- [ ] **Commit**

```bash
git add src/App.tsx
git commit -m "feat(frontend): add auth gate, QueryClientProvider, Cognito callback handler"
```
