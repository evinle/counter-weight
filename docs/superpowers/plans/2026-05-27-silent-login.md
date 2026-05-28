# Silent Login & Auth State in Zustand — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate auth state from React `useState` into a Zustand store and add a `prompt=none` silent-login path so iOS users are not forced to manually log in after the app kills their refresh-token cookie.

**Architecture:** A new `authStore.ts` owns all auth logic (state, bootstrap, login, silent login, logout). `useAuth` becomes a thin Zustand selector. On bootstrap failure, if `cw:lastUser` is set in localStorage, the app redirects to Cognito with `prompt=none` instead of immediately showing LoginView. LoginView reads the store directly and shows a "Continue as [firstName]" button when `lastUser` is available.

**Tech Stack:** Zustand (`create`), Vitest + `@testing-library/react` (`renderHook`, `act`, `waitFor`), jsdom localStorage, Cognito OAuth2 `prompt=none`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/storageKeys.ts` | Modify | Add `LastUser`, `isLastUser`, `readLastUser`, `StorageKey.LastUser` |
| `src/store/authStore.ts` | **Create** | Zustand store — all auth state and actions; defines `AuthUser`, `AuthState` |
| `src/hooks/useAuth.ts` | Replace | Thin Zustand selector; re-exports `AuthUser`, `AuthState` |
| `src/App.tsx` | Modify | Call `bootstrap()` + `subscribeToAuthPersistence()` on mount; update callback handler |
| `src/components/LoginView.tsx` | Modify | Remove props; read store directly; add "Continue as [firstName]" button |
| `src/test/storageKeys.test.ts` | **Create** | Tests for `isLastUser` and `readLastUser` |
| `src/test/authStore.test.ts` | **Create** | Comprehensive tests for the Zustand store |
| `src/test/useAuth.test.ts` | Replace | Simplified selector tests (bootstrap tests move to authStore.test.ts) |

---

## Task 1: Extend `storageKeys.ts` with `LastUser`

**Files:**
- Modify: `src/lib/storageKeys.ts`
- Create: `src/test/storageKeys.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/test/storageKeys.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { isLastUser, readLastUser, StorageKey } from '../lib/storageKeys'

beforeEach(() => localStorage.clear())

describe('isLastUser', () => {
  it('returns true for a valid LastUser object', () => {
    expect(isLastUser({ userId: 'u1', firstName: 'Alice' })).toBe(true)
  })

  it('returns false when userId is missing', () => {
    expect(isLastUser({ firstName: 'Alice' })).toBe(false)
  })

  it('returns false when firstName is not a string', () => {
    expect(isLastUser({ userId: 'u1', firstName: 42 })).toBe(false)
  })

  it('returns false for null', () => {
    expect(isLastUser(null)).toBe(false)
  })
})

describe('readLastUser', () => {
  it('returns null when localStorage has no entry', () => {
    expect(readLastUser()).toBeNull()
  })

  it('returns parsed LastUser when entry is valid', () => {
    localStorage.setItem(StorageKey.LastUser, JSON.stringify({ userId: 'u1', firstName: 'Alice' }))
    expect(readLastUser()).toEqual({ userId: 'u1', firstName: 'Alice' })
  })

  it('returns null when JSON is malformed', () => {
    localStorage.setItem(StorageKey.LastUser, 'not-json')
    expect(readLastUser()).toBeNull()
  })

  it('returns null when stored object fails isLastUser', () => {
    localStorage.setItem(StorageKey.LastUser, JSON.stringify({ userId: 'u1' }))
    expect(readLastUser()).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/rhkfu/projects/counter-weight-claude && npx vitest run src/test/storageKeys.test.ts
```

Expected: FAIL — `isLastUser`, `readLastUser`, `StorageKey.LastUser` not found.

- [ ] **Step 3: Update `src/lib/storageKeys.ts`**

```ts
export const STORAGE_PREFIX = 'cw'
export const STORAGE_SEP = ':'

const LOCAL_STORAGE_KEYS = ['LastSyncedAt', 'Bootstrapped', 'LastUser'] as const
export type LocalStorageKey = typeof LOCAL_STORAGE_KEYS[number]

export const StorageKey = {
  LastSyncedAt: `${STORAGE_PREFIX}${STORAGE_SEP}lastSyncedAt`,
  Bootstrapped: `${STORAGE_PREFIX}${STORAGE_SEP}bootstrapped`,
  LastUser: `${STORAGE_PREFIX}${STORAGE_SEP}lastUser`,
} as const satisfies Record<LocalStorageKey, string>
export type StorageKey = typeof StorageKey[keyof typeof StorageKey]

export function bootstrappedKey(userId: string): string {
  return `${StorageKey.Bootstrapped}${STORAGE_SEP}${userId}`
}

export interface LastUser {
  userId: string
  firstName: string
}

export function isLastUser(v: unknown): v is LastUser {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as LastUser).userId === 'string' &&
    typeof (v as LastUser).firstName === 'string'
  )
}

export function readLastUser(): LastUser | null {
  try {
    const raw = localStorage.getItem(StorageKey.LastUser)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isLastUser(parsed) ? parsed : null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/test/storageKeys.test.ts
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storageKeys.ts src/test/storageKeys.test.ts
git commit -m "feat: add LastUser type, isLastUser guard, readLastUser helper to storageKeys"
```

---

## Task 2: Create `authStore.ts` — state, synchronous actions, and persistence subscriber

**Files:**
- Create: `src/store/authStore.ts`
- Create: `src/test/authStore.test.ts` (initial section)

- [ ] **Step 1: Write the failing tests (synchronous actions)**

Create `src/test/authStore.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run src/test/authStore.test.ts
```

Expected: FAIL — `authStore` module not found.

- [ ] **Step 3: Create `src/store/authStore.ts`**

```ts
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
```

- [ ] **Step 4: Run synchronous tests to verify they pass**

```bash
npx vitest run src/test/authStore.test.ts
```

Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/authStore.ts src/test/authStore.test.ts
git commit -m "feat: create Zustand authStore with synchronous actions and persistence subscriber"
```

---

## Task 3: Add `bootstrap()` tests to `authStore.test.ts`

**Files:**
- Modify: `src/test/authStore.test.ts`

- [ ] **Step 1: Add bootstrap tests**

Append to `src/test/authStore.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify bootstrap tests pass**

```bash
npx vitest run src/test/authStore.test.ts
```

Expected: all tests PASS including the 5 new bootstrap tests.

- [ ] **Step 3: Commit**

```bash
git add src/test/authStore.test.ts
git commit -m "test: add bootstrap() tests to authStore"
```

---

## Task 4: Add `login()`, `loginSilent()`, `logout()` tests

**Files:**
- Modify: `src/test/authStore.test.ts`

- [ ] **Step 1: Append login/loginSilent/logout tests**

Append to `src/test/authStore.test.ts`:

```ts
describe('login()', () => {
  it('redirects to Cognito authorize URL without prompt=none', () => {
    useAuthStore.getState().login()
    expect(window.location.href).toContain('https://test.auth.example.com/oauth2/authorize')
    expect(window.location.href).toContain('client_id=test-client-id')
    expect(window.location.href).not.toContain('prompt=none')
  })
})

describe('loginSilent()', () => {
  it('redirects to Cognito authorize URL with prompt=none', () => {
    useAuthStore.getState().loginSilent()
    expect(window.location.href).toContain('https://test.auth.example.com/oauth2/authorize')
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
```

- [ ] **Step 2: Run all authStore tests**

```bash
npx vitest run src/test/authStore.test.ts
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/test/authStore.test.ts
git commit -m "test: add login, loginSilent, logout tests to authStore"
```

---

## Task 5: Replace `useAuth.ts` with Zustand selector + update `useAuth.test.ts`

**Files:**
- Replace: `src/hooks/useAuth.ts`
- Replace: `src/test/useAuth.test.ts`

- [ ] **Step 1: Rewrite `src/test/useAuth.test.ts`**

The bootstrap tests now live in `authStore.test.ts`. Replace the file with selector-shape tests:

```ts
import { renderHook } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { useAuth } from '../hooks/useAuth'
import { useAuthStore } from '../store/authStore'

const initialState = {
  state: 'loading' as const,
  user: null,
  lastUser: null,
  bootstrapStarted: false,
}

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState(initialState)
})

describe('useAuth', () => {
  it('exposes state, user, login, logout, continueAsGuest', () => {
    const { result } = renderHook(() => useAuth())
    expect(result.current.state).toBe('loading')
    expect(result.current.user).toBeNull()
    expect(typeof result.current.login).toBe('function')
    expect(typeof result.current.logout).toBe('function')
    expect(typeof result.current.continueAsGuest).toBe('function')
  })

  it('reflects store state changes', () => {
    const { result, rerender } = renderHook(() => useAuth())
    useAuthStore.getState().setUnauthenticated()
    rerender()
    expect(result.current.state).toBe('unauthenticated')
  })
})
```

- [ ] **Step 2: Run to verify new tests fail (useAuth still has old implementation)**

```bash
npx vitest run src/test/useAuth.test.ts
```

Expected: tests may pass or fail depending on current impl — proceed regardless.

- [ ] **Step 3: Rewrite `src/hooks/useAuth.ts`**

```ts
import { useAuthStore } from '../store/authStore'
import type { AuthState, AuthUser } from '../store/authStore'
export type { AuthState, AuthUser } from '../store/authStore'

export interface UseAuth {
  state: AuthState
  user: AuthUser | null
  login: () => void
  logout: () => Promise<void>
  continueAsGuest: () => void
}

export function useAuth(): UseAuth {
  return useAuthStore((s) => ({
    state: s.state,
    user: s.user,
    login: s.login,
    logout: s.logout,
    continueAsGuest: s.continueAsGuest,
  }))
}
```

- [ ] **Step 4: Update `src/test/useSyncEngine.test.ts` — `AuthUser` fixture now requires `firstName`**

`AuthUser` gains a required `firstName` field. Update the `USER` fixture at line 24:

```ts
const USER = { userId: 'user-1', email: 'user@example.com', firstName: 'Test' } satisfies AuthUser
```

- [ ] **Step 5: Run all tests to verify nothing is broken**

```bash
npx vitest run
```

Expected: all test suites PASS.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useAuth.ts src/test/useAuth.test.ts src/test/useSyncEngine.test.ts
git commit -m "refactor: replace useAuth React state with Zustand selector"
```

---

## Task 6: Update `App.tsx`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Update imports**

At the top of `src/App.tsx`, change:

```ts
import { useAuth } from "./hooks/useAuth";
```

to:

```ts
import { useAuth } from "./hooks/useAuth";
import { useAuthStore, subscribeToAuthPersistence } from "./store/authStore";
```

Remove `setIdToken` from the `trpc` import line since it's no longer called in App.tsx directly:

```ts
import { trpc } from "./lib/trpc";
```

- [ ] **Step 2: Add bootstrap + persistence effect**

Replace the existing `useAuth` destructure and add the bootstrap effect. Change:

```ts
const { state, user, login, continueAsGuest } = useAuth();
```

to:

```ts
const { state, user } = useAuth();
```

Add this effect immediately after (before the existing callback handler effect):

```ts
useEffect(() => {
  const unsubscribe = subscribeToAuthPersistence()
  useAuthStore.getState().bootstrap()
  return unsubscribe
}, [])
```

- [ ] **Step 3: Update the Cognito callback handler**

Replace the existing callback `useEffect`:

```ts
// Handle Cognito auth callback
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const error = params.get("error");

  if (!code && !error) return;

  window.history.replaceState({}, "", "/");

  if (error === "login_required") {
    useAuthStore.getState().setUnauthenticated();
    return;
  }

  if (code) {
    fetchFromBackend("/auth/callback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ code, origin: window.location.origin }),
    }).then(async (res) => {
      if (!res.ok) return;
      const { idToken } = (await res.json()) as { idToken: string };
      useAuthStore.getState().setAuthenticated(idToken);
    });
  }
}, []);
```

- [ ] **Step 4: Update LoginView render — remove props**

Change:

```tsx
return <LoginView onLogin={login} onContinueAsGuest={continueAsGuest} />;
```

to:

```tsx
return <LoginView />;
```

- [ ] **Step 5: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire bootstrap and silent-login callback handler in App.tsx"
```

---

## Task 7: Update `LoginView.tsx`

**Files:**
- Modify: `src/components/LoginView.tsx`

- [ ] **Step 1: Rewrite `LoginView.tsx`**

Replace the entire file:

```tsx
import { useAuthStore } from '../store/authStore'

export function LoginView() {
  const login = useAuthStore((s) => s.login)
  const loginSilent = useAuthStore((s) => s.loginSilent)
  const continueAsGuest = useAuthStore((s) => s.continueAsGuest)
  const lastUser = useAuthStore((s) => s.lastUser)

  return (
    <div className="h-full flex flex-col items-center justify-center gap-8 px-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white mb-2">Counter Weight</h1>
        <p className="text-slate-400 text-sm">Sign in to sync your timers across devices</p>
      </div>

      <div className="w-full max-w-xs flex flex-col gap-3">
        {lastUser && (
          <button
            onClick={loginSilent}
            className="w-full bg-blue-600 text-white font-semibold py-3 px-6 rounded-xl active:scale-95 transition-all cursor-pointer"
          >
            Continue as {lastUser.firstName}
          </button>
        )}

        <button
          onClick={login}
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

        <button
          onClick={continueAsGuest}
          className="w-full text-slate-400 text-sm py-2 active:opacity-70 transition-opacity cursor-pointer"
        >
          Continue without signing in
        </button>
      </div>

      <p className="text-slate-600 text-xs text-center">
        Your timers are stored locally and sync when you're online
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 3: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors. If `AuthUser` consumers (e.g. `useSyncEngine.ts`) have type errors from the new `firstName` field, they'll be structural (non-breaking additions) — no fixes needed unless tsc complains.

- [ ] **Step 4: Commit**

```bash
git add src/components/LoginView.tsx
git commit -m "feat: update LoginView to read from authStore and add Continue as X button"
```

---

## Done

All 7 tasks complete. The feature is:

- Auth state is a Zustand singleton — calling `useAuth()` in 10 components is free
- On app open: tries `/auth/refresh` → if 401 + `cw:lastUser` exists → `prompt=none` redirect → silent re-auth
- If Cognito session also expired: `error=login_required` → LoginView with "Continue as [firstName]" still available
- `cw:lastUser` is written/removed as a side effect of `user` changes, not inside actions
- Explicit logout clears `cw:lastUser` so "Continue as X" is not shown after logout
