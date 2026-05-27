# Silent Login & Auth State in Zustand

**Date:** 2026-05-27  
**Status:** Approved

## Problem

iOS purges the `refresh_token` httpOnly cookie when the PWA is closed. On next open, `useAuth` fires `/auth/refresh`, gets a 401, and drops the user onto LoginView — even though they never explicitly logged out.

## Goals

- Re-authenticate silently on app open when the cookie is gone but the user hasn't logged out
- Move auth state from React `useState` into a Zustand store so it's a singleton regardless of how many components call `useAuth`
- Show "Continue as [firstName]" in LoginView when a previous session is detectable

## Solution

Cognito `prompt=none` redirect: if the refresh fails and a `cw:lastUser` localStorage entry exists, redirect to Cognito with `prompt=none`. Cognito returns a code silently if its own session is still alive, or `error=login_required` if not. On failure, show LoginView (with the "Continue as X" button still available).

---

## Architecture

### `src/store/authStore.ts` (new)

Zustand store — single source of truth for auth state.

```ts
type AuthStore = {
  state: AuthState                   // 'loading' | 'unauthenticated' | 'authenticated' | 'guest'
  user: AuthUser | null              // { userId, email }
  lastUser: LastUser | null          // { userId, firstName } — read from localStorage on store creation

  bootstrap: () => void              // called once on app mount; guarded against re-runs
  login: () => void                  // full Cognito redirect
  loginSilent: () => void            // prompt=none redirect
  continueAsGuest: () => void
  logout: () => Promise<void>
  setAuthenticated: (idToken: string) => void   // called by bootstrap success + callback handler
  setUnauthenticated: () => void                // called by bootstrap error (no lastUser)
}
```

`lastUser` is initialized by reading `StorageKey.LastUser` from localStorage when the store is created — before `bootstrap()` runs — so LoginView can show "Continue as [firstName]" immediately if the cookie is gone.

### `LastUser` type & `StorageKey.LastUser`

New type and type guard added to `src/lib/storageKeys.ts`:

```ts
export interface LastUser {
  userId: string
  firstName: string
}

export function isLastUser(v: unknown): v is LastUser {
  return (
    typeof v === 'object' && v !== null &&
    typeof (v as LastUser).userId === 'string' &&
    typeof (v as LastUser).firstName === 'string'
  )
}
```

Reading back from localStorage goes through `isLastUser`:
```ts
function readLastUser(): LastUser | null {
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

New key in `storageKeys.ts`:

```ts
export const StorageKey = {
  ...existing,
  LastUser: `${STORAGE_PREFIX}${STORAGE_SEP}lastUser`,
} as const satisfies Record<LocalStorageKey, string>
```

### `subscribeToAuthPersistence()` (new, called once at app init)

A Zustand `subscribe` listener — not an action — that syncs `user` changes to `cw:lastUser` in localStorage. Kept separate from `setAuthenticated` so the action has no localStorage side effects.

```ts
export function subscribeToAuthPersistence() {
  return useAuthStore.subscribe((state, prev) => {
    if (state.user === prev.user) return
    if (state.user) {
      localStorage.setItem(StorageKey.LastUser, JSON.stringify({
        userId: state.user.userId,
        firstName: extractFirstName(state.user),  // from given_name JWT claim
      }))
    } else {
      localStorage.removeItem(StorageKey.LastUser)
    }
  })
}
```

Called in `App.tsx` alongside `bootstrap()`, returns an unsubscribe fn.

---

## Data Flow

### `bootstrap()` (guarded)

The store holds a `bootstrapStarted: boolean` flag (starts `false`). `bootstrap()` sets it to `true` on first call and returns early on any subsequent call — this blocks both concurrent calls while the fetch is in flight (state is still `'loading'`) and re-runs after bootstrap completes.

```
if bootstrapStarted → return early
set bootstrapStarted = true

POST /auth/refresh (3s timeout, credentials: include)
  ✓ 200 → setAuthenticated(idToken)
  ✗ 401 → read cw:lastUser from localStorage
             present → loginSilent()   [page redirects, no further execution]
             absent  → setUnauthenticated()
  ✗ timeout/network → setUnauthenticated()
```

`bootstrap()` is called once in `App.tsx` on mount. All `useAuth` call sites just read Zustand state — no fetches triggered.

### `setAuthenticated(idToken)`

1. Parses the JWT — extracts `sub` (userId), `email`, `given_name` (firstName)
2. Sets `user` in the store
3. Sets `state = 'authenticated'`
4. Calls `setIdToken(idToken)` on the tRPC client

The `subscribeToAuthPersistence` listener then writes `cw:lastUser` to localStorage as a side effect.

### `loginSilent()`

Redirects to the same Cognito URL as `login()` with `prompt=none` added:

```ts
params.set('prompt', 'none')
window.location.href = `${COGNITO_DOMAIN}/oauth2/authorize?${params}`
```

### `/auth/callback` handler in `App.tsx`

Existing handler already covers `?code=` → POST backend → `setAuthenticated(idToken)`.

New branch added:

```ts
if (params.get('error') === 'login_required') {
  // Reset URL to '/' — removes both the /auth/callback path and the error query params
  // so a page refresh doesn't re-trigger this handler
  window.history.replaceState({}, '', '/')
  useAuthStore.getState().setUnauthenticated()
}
```

The existing `?code=` success branch also gets `window.history.replaceState({}, '', '/')` before reloading, replacing the current `/auth/callback?code=...` URL.

### `logout()`

1. POST `/auth/logout`
2. Calls `setIdToken(null)`
3. Removes `bootstrappedKey(user.userId)` and `StorageKey.LastSyncedAt` from localStorage
4. Sets `user = null`, `state = 'unauthenticated'` in store

`subscribeToAuthPersistence` removes `cw:lastUser` when `user` becomes null.

---

## Component Changes

### `useAuth` (updated)

Becomes a thin Zustand selector — no state, no effects, no fetches:

```ts
export function useAuth(): UseAuth {
  return useAuthStore(s => ({
    state: s.state,
    user: s.user,
    login: s.login,
    logout: s.logout,
    continueAsGuest: s.continueAsGuest,
  }))
}
```

### `LoginView` (updated)

Reads from the store directly:

```ts
const lastUser = useAuthStore(s => s.lastUser)
const loginSilent = useAuthStore(s => s.loginSilent)
```

Button order when `lastUser` is present:
1. **Continue as [firstName]** → `loginSilent()`
2. **Login** → `login()`
3. **Continue as Guest** → `continueAsGuest()`

When `lastUser` is null, the first button is omitted.

---

## Error Cases

| Scenario | Outcome |
|---|---|
| Cookie gone, Cognito session alive | `prompt=none` succeeds → authenticated |
| Cookie gone, Cognito session expired | `error=login_required` → LoginView with "Continue as X" |
| Cookie gone, no `cw:lastUser` (first-time or post-logout) | `setUnauthenticated()` → LoginView without "Continue as X" |
| Network timeout on refresh | `setUnauthenticated()` → LoginView |
| `given_name` missing from JWT | Fall back to email local-part as firstName |

---

## Files Changed

| File | Change |
|---|---|
| `src/store/authStore.ts` | **New** — Zustand auth store |
| `src/hooks/useAuth.ts` | Replace React state with Zustand selectors |
| `src/lib/storageKeys.ts` | Add `LastUser` key + `LastUser` interface |
| `src/App.tsx` | Call `bootstrap()` on mount; handle `error=login_required` in callback; call `subscribeToAuthPersistence()` |
| `src/components/LoginView.tsx` | Add "Continue as X" button; read `lastUser` + `loginSilent` from store |
