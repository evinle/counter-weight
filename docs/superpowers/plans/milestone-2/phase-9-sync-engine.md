# Phase 9: Frontend Sync Engine [CODEBASE]

> Back to [index](index.md)

## Prior Phase Context

**From Phase 7 (Dexie M2 fields):** `src/db/schema.ts` `Timer` type has:
```typescript
serverId: string | null     // null until synced
userId: string | null       // Cognito sub
syncStatus: 'pending' | 'synced'
version: number | null      // server version for optimistic concurrency
```
Dexie indexes include `syncStatus` and `serverId` (added in v3 stores).

**From Phase 8 (useAuth + tRPC client):**
```typescript
// src/hooks/useAuth.ts
export type AuthUser = { userId: string; email: string }
export function useAuth(): { state: AuthState; user: AuthUser | null; login: () => void; logout: () => Promise<void> }

// src/lib/trpc.ts
export const trpc  // createTRPCClient<AppRouter> with Bearer auth + 401 retry
export function setIdToken(token: string | null): void
```

**From Phase 5 (tRPC procedures used by sync engine):**
```typescript
trpc.timers.upsert.mutate({ serverId, title, description, emoji,
  targetDatetime, originalTargetDatetime, status, priority,
  isFlagged, recurrenceRule, version? })
  → Promise<{ serverId: string; version: number }>

trpc.timers.get.query({ serverId: string })
  → Promise<ServerTimer | null>

trpc.timers.complete.mutate({ serverId, version })
  → Promise<{ ok: true }>

trpc.timers.cancel.mutate({ serverId, version })
  → Promise<{ ok: true }>

trpc.timers.reconcile.query({ since: string | null, records: { serverId, updatedAt }[] })
  → Promise<ServerTimer[]>
```

**Conflict resolution policy (server wins):** On `CONFLICT` (409) from `upsert`, fetch the server record via `trpc.timers.get` and overwrite the local Dexie record. Log to `console.warn` with `{ timerId, userId, localVersion, serverVersion }`.

**localStorage key:** `cw:lastSyncedAt` — ISO string, bounds the `reconcile` query's `since` param.

---

## Task 9.1: useSyncEngine hook (with test)

**Files:**
- Create: `src/hooks/useSyncEngine.ts`
- Create: `src/test/useSyncEngine.test.ts`

- [ ] **Write the failing tests**

Create `src/test/useSyncEngine.test.ts`:

```typescript
import 'fake-indexeddb/auto'
import { renderHook, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db'
import { useSyncEngine } from '../hooks/useSyncEngine'
import type { AuthUser } from '../hooks/useAuth'

// Mock the tRPC client
vi.mock('../lib/trpc', () => ({
  trpc: {
    timers: {
      upsert: { mutate: vi.fn() },
      list: { query: vi.fn() },
      reconcile: { query: vi.fn() },
    },
  },
  idToken: 'mock-token',
  setIdToken: vi.fn(),
}))

import { trpc } from '../lib/trpc'

const USER: AuthUser = { userId: 'user-1', email: 'user@example.com' }

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

    const conflictError = Object.assign(new Error('Conflict'), {
      data: { code: 'CONFLICT' },
    })
    vi.mocked(trpc.timers.upsert.mutate).mockRejectedValueOnce(conflictError)
    vi.mocked(trpc.timers.get.query).mockResolvedValueOnce({
      id: 'existing-srv',
      title: 'Server version',
      description: null,
      emoji: null,
      targetDatetime: new Date('2026-06-01T12:00:00Z'),
      originalTargetDatetime: new Date('2026-06-01T12:00:00Z'),
      status: 'active',
      priority: 'medium',
      isFlagged: false,
      recurrenceRule: null,
      version: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
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
})
```

- [ ] **Run — expect FAIL (module not found)**

```bash
npx vitest run src/test/useSyncEngine.test.ts
```

- [ ] **Create `src/hooks/useSyncEngine.ts`**

```typescript
import { useEffect } from 'react'
import { db } from '../db'
import { trpc } from '../lib/trpc'
import type { AuthUser } from './useAuth'

const LAST_SYNCED_KEY = 'cw:lastSyncedAt'

// Module-level lock: survives user changes (logout → login) within the same tab.
// useRef would reset on unmount/remount, allowing overlapping sync runs.
let syncRunning = false

type ServerTimer = Awaited<ReturnType<typeof trpc.timers.list.query>>[number]

function mapServerTimer(s: ServerTimer) {
  return {
    serverId: s.id,
    title: s.title,
    description: s.description,
    emoji: s.emoji,
    targetDatetime: new Date(s.targetDatetime),
    originalTargetDatetime: new Date(s.originalTargetDatetime),
    status: s.status,
    priority: s.priority,
    isFlagged: s.isFlagged,
    recurrenceRule: s.recurrenceRule as { cron: string; tz: string } | null,
    version: s.version,
    createdAt: new Date(s.createdAt),
    updatedAt: new Date(s.updatedAt),
    groupId: null,
    syncStatus: 'synced' as const,
  }
}

export function useSyncEngine({ user }: { user: AuthUser | null }) {
  useEffect(() => {
    if (!user) return

    async function drainPending() {
      const pending = await db.timers
        .where('syncStatus')
        .equals('pending')
        .and((t) => t.userId === user!.userId)
        .toArray()

      for (const timer of pending) {
        try {
          const result = await trpc.timers.upsert.mutate({
            serverId: timer.serverId,
            title: timer.title,
            description: timer.description,
            emoji: timer.emoji,
            targetDatetime: timer.targetDatetime.toISOString(),
            originalTargetDatetime: timer.originalTargetDatetime.toISOString(),
            status: timer.status,
            priority: timer.priority,
            isFlagged: timer.isFlagged,
            recurrenceRule: timer.recurrenceRule,
            version: timer.version ?? undefined,
          })
          await db.timers.update(timer.id!, {
            serverId: result.serverId,
            syncStatus: 'synced',
            version: result.version,
          })
        } catch (err: unknown) {
          const code = (err as { data?: { code?: string } })?.data?.code
          if (code === 'CONFLICT' && timer.serverId) {
            // Server wins: fetch the single conflicting record and overwrite Dexie
            const match = await trpc.timers.get.query({ serverId: timer.serverId })
            if (match) {
              console.warn('[conflict] overwriting local timer', {
                timerId: timer.id,
                userId: user!.userId,
                localVersion: timer.version,
                serverVersion: match.version,
              })
              await db.timers.update(timer.id!, {
                ...mapServerTimer(match),
                syncStatus: 'synced',
              })
            }
          }
          // Other errors: leave pending, retry on next sync
        }
      }
    }

    async function reconcile() {
      const lastSyncedAt = localStorage.getItem(LAST_SYNCED_KEY)
      const localTimers = await db.timers
        .where('userId')
        .equals(user!.userId)
        .toArray()

      const records = localTimers
        .filter((t) => t.serverId)
        .map((t) => ({ serverId: t.serverId!, updatedAt: t.updatedAt.toISOString() }))

      const stale = await trpc.timers.reconcile.query({ since: lastSyncedAt, records })

      for (const serverTimer of stale) {
        const local = localTimers.find((t) => t.serverId === serverTimer.id)
        if (local?.id !== undefined) {
          await db.timers.update(local.id, {
            ...mapServerTimer(serverTimer),
            syncStatus: 'synced',
          })
        } else {
          await db.timers.add({
            ...mapServerTimer(serverTimer),
            userId: user!.userId,
            syncStatus: 'synced',
          })
        }
      }

      localStorage.setItem(LAST_SYNCED_KEY, new Date().toISOString())
    }

    async function sync() {
      if (syncRunning) return
      syncRunning = true
      try {
        await drainPending()
        await reconcile()
      } finally {
        syncRunning = false
      }
    }

    sync()

    function onOnline() { sync() }
    function onVisibility() { if (document.visibilityState === 'visible') sync() }

    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [user?.userId])
}
```

- [ ] **Run tests — expect PASS**

```bash
npx vitest run src/test/useSyncEngine.test.ts
```

- [ ] **Run full suite**

```bash
npx vitest run
```

- [ ] **Commit**

```bash
git add src/hooks/useSyncEngine.ts src/test/useSyncEngine.test.ts
git commit -m "feat(frontend): add useSyncEngine (drain pending, pull on reconnect, reconcile)"
```

---

## Task 9.2: Tiered mutations in useTimers.ts

**Files:**
- Modify: `src/hooks/useTimers.ts`

The spec defines two tiers:
- **Critical** (create, reschedule/edit, complete, cancel): Dexie write + concurrent server mutation
- **Deferred** (rename, emoji, flag, priority): Dexie write, set `syncStatus: 'pending'`

Currently `editTimer` covers both reschedule and non-critical field changes. We need to split these or handle them in the server sync based on what changed.

The simplest approach without restructuring `editTimer`: after each critical Dexie write, fire the tRPC mutation concurrently (don't await). On success, update `serverId` and `version` in Dexie. On 409, let `useSyncEngine` handle it on next sync.

- [ ] **Update `src/hooks/useTimers.ts`**

Replace the file content:

```typescript
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Priority, Timer } from '../db/schema'
import { HISTORY_STATUSES } from '../db/schema'
import { trpc } from '../lib/trpc'

export function useActiveTimers(): Timer[] {
  return (
    useLiveQuery(
      () => db.timers.where('status').equals('active').sortBy('targetDatetime'),
      [],
      [],
    ) ?? []
  )
}

export function useFeedTimers(): Timer[] {
  return (
    useLiveQuery(
      () =>
        db.timers
          .where('status')
          .anyOf('active', 'fired')
          .sortBy('targetDatetime'),
      [],
      [],
    ) ?? []
  )
}

export function useHistoryTimers(): Timer[] {
  return (
    useLiveQuery(
      () =>
        db.timers
          .where('status')
          .anyOf(...HISTORY_STATUSES)
          .toArray()
          .then((arr) =>
            arr.sort(
              (a, b) => b.targetDatetime.getTime() - a.targetDatetime.getTime(),
            ),
          ),
      [],
      [],
    ) ?? []
  )
}

export async function createTimer(
  data: Omit<
    Timer,
    | 'id'
    | 'createdAt'
    | 'updatedAt'
    | 'originalTargetDatetime'
    | 'serverId'
    | 'userId'
    | 'syncStatus'
    | 'version'
  >,
  userId: string | null,
): Promise<number | undefined> {
  const now = new Date()
  const id = await db.timers.add({
    ...data,
    originalTargetDatetime: data.targetDatetime,
    createdAt: now,
    updatedAt: now,
    serverId: null,
    userId,
    syncStatus: userId ? 'pending' : 'synced',
    version: null,
  })

  if (userId && id !== undefined) {
    // TODO(M3): generate a clientId UUID before this write and send it with the upsert
    // so the server can deduplicate if the app crashes between server create and the
    // Dexie update below. Without it, drainPending re-sends serverId:null and creates
    // a duplicate. Low frequency but worth fixing when adding M3 server events.
    // Concurrent server sync — don't block the UI
    trpc.timers.upsert
      .mutate({
        serverId: null,
        title: data.title,
        description: data.description,
        emoji: data.emoji,
        targetDatetime: data.targetDatetime.toISOString(),
        originalTargetDatetime: data.targetDatetime.toISOString(),
        status: data.status,
        priority: data.priority,
        isFlagged: data.isFlagged,
        recurrenceRule: data.recurrenceRule,
      })
      .then((result) => {
        db.timers.update(id, {
          serverId: result.serverId,
          syncStatus: 'synced',
          version: result.version,
        })
      })
      .catch(() => {
        // Stays pending — useSyncEngine drains on reconnect
      })
  }

  return id
}

export async function completeTimer(id: number): Promise<void> {
  const timer = await db.timers.get(id)
  await db.timers.update(id, { status: 'completed', updatedAt: new Date() })

  if (timer?.serverId && timer.version !== null) {
    trpc.timers.complete
      .mutate({ serverId: timer.serverId, version: timer.version })
      .then(() => db.timers.update(id, { syncStatus: 'synced' }))
      .catch(() => db.timers.update(id, { syncStatus: 'pending' }))
  } else {
    // Timer is offline-created (no serverId) or partially synced — mark pending
    // so drainPending will upsert the final status to the server once it syncs.
    await db.timers.update(id, { syncStatus: 'pending' })
  }
}

export async function cancelTimer(id: number): Promise<void> {
  const timer = await db.timers.get(id)
  await db.timers.update(id, { status: 'cancelled', updatedAt: new Date() })

  if (timer?.serverId && timer.version !== null) {
    trpc.timers.cancel
      .mutate({ serverId: timer.serverId, version: timer.version })
      .then(() => db.timers.update(id, { syncStatus: 'synced' }))
      .catch(() => db.timers.update(id, { syncStatus: 'pending' }))
  } else {
    await db.timers.update(id, { syncStatus: 'pending' })
  }
}

export async function editTimer(
  id: number,
  params: {
    targetDatetime: Date
    title: string
    emoji: string | null
    priority: Priority
  },
) {
  const current = await db.timers.get(id)
  if (!current) return

  const isAlreadyExtended = current.targetDatetime > current.originalTargetDatetime
  const isExtending = params.targetDatetime > current.targetDatetime

  if (isAlreadyExtended && isExtending) return

  const isReschedule = params.targetDatetime.getTime() !== current.targetDatetime.getTime()
  await db.timers.update(id, { ...params, updatedAt: new Date() })

  if (isReschedule && current.serverId && current.version !== null) {
    // Reschedule is critical — sync concurrently
    trpc.timers.upsert
      .mutate({
        serverId: current.serverId,
        title: params.title,
        description: current.description,
        emoji: params.emoji,
        targetDatetime: params.targetDatetime.toISOString(),
        originalTargetDatetime: current.originalTargetDatetime.toISOString(),
        status: current.status,
        priority: params.priority,
        isFlagged: current.isFlagged,
        recurrenceRule: current.recurrenceRule,
        version: current.version,
      })
      .then((r) => db.timers.update(id, { syncStatus: 'synced', version: r.version }))
      .catch(() => db.timers.update(id, { syncStatus: 'pending' }))
  } else {
    // Title/emoji/priority change — deferred sync
    await db.timers.update(id, { syncStatus: 'pending' })
  }
}

export async function bulkImportTimers(timers: Omit<Timer, 'id'>[]): Promise<void> {
  await db.timers.bulkAdd(timers as Timer[])
}
```

- [ ] **Run the full test suite — ensure existing useTimers tests pass**

`createTimer` now requires a `userId` argument. Update the call sites in tests:

In `src/test/useTimers.test.ts`, add `null` as the second argument to all `createTimer(BASE)` calls:

```typescript
const id = await createTimer(BASE, null)
```

- [ ] **Run tests**

```bash
npx vitest run
```

- [ ] **Commit**

```bash
git add src/hooks/useTimers.ts src/test/useTimers.test.ts
git commit -m "feat(frontend): tiered sync mutations in useTimers (critical concurrent, deferred pending)"
```

---

## Task 9.3: Wire sync engine in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Add `useSyncEngine` to App.tsx**

Add import:
```tsx
import { useSyncEngine } from './hooks/useSyncEngine'
```

Add after the `useAuth` call inside `App`:
```tsx
useSyncEngine({ user })
```

Update the `handleCreateNew` path to pass `user?.userId ?? null` to `createTimer`. In `CreateEditView`, thread through the `userId` to the `createTimer` call site.

- [ ] **Run full test suite**

```bash
npx vitest run
```

- [ ] **Run dev server and test offline → online flow manually**

```bash
npm run dev
```

1. Open Chrome DevTools → Network → Offline
2. Create a timer — should appear instantly
3. Open Chrome DevTools → Network → Online
4. Timer `syncStatus` should flip to `synced` (check via Dexie DevTools extension)

- [ ] **Commit**

```bash
git add src/App.tsx
git commit -m "feat(frontend): wire useSyncEngine in App"
```
