# Phase 7: Frontend Dexie Migration [CODEBASE]

> Back to [index](index.md)

## Prior Phase Context

**From Phase 3 (server schema):** The server `timers` table has these fields that need to be mirrored in Dexie for sync tracking:
- `id` (uuid) — stored as `serverId: string | null` in Dexie
- `userId` (text/Cognito sub) — stored as `userId: string | null` in Dexie
- `version` (integer) — stored as `version: number | null` in Dexie (null = not yet synced)

**New Dexie fields added in this phase:**
```typescript
serverId: string | null   // server UUID, null until synced
userId: string | null     // Cognito sub, null for offline-only timers
syncStatus: SyncStatus    // 'pending' | 'synced'
version: number | null    // server version, null until synced
```

**Current Dexie version is 2.** This phase bumps it to version 3 with an upgrade migration.

**Existing `Timer` interface** is in `src/db/schema.ts`. The `createTimer` function and its callers in `src/hooks/useTimers.ts` need updating to include M2 field defaults.

---

## Task 7.1: Update Timer schema

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/db/index.ts`
- Modify: `src/hooks/useTimers.ts`

- [ ] **Write the migration test first**

Create `src/test/db.migration.test.ts`:

```typescript
import 'fake-indexeddb/auto'
import { db } from '../db'

describe('Dexie v3 migration', () => {
  it('existing timers get M2 default fields after migration', async () => {
    // Simulate a pre-migration record by writing a raw object
    // (version 3 migration runs automatically on db open in fake-indexeddb)
    const id = await db.timers.add({
      title: 'Pre-migration timer',
      description: null,
      emoji: null,
      targetDatetime: new Date('2026-06-01T12:00:00Z'),
      originalTargetDatetime: new Date('2026-06-01T12:00:00Z'),
      status: 'active',
      priority: 'medium',
      isFlagged: false,
      groupId: null,
      recurrenceRule: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      // M2 fields come from migration defaults
      serverId: null,
      userId: null,
      syncStatus: 'synced',
      version: null,
    } as any)

    const timer = await db.timers.get(id)
    expect(timer?.serverId).toBeNull()
    expect(timer?.userId).toBeNull()
    expect(timer?.syncStatus).toBe('synced')
    expect(timer?.version).toBeNull()
  })
})
```

- [ ] **Run — expect FAIL (M2 fields don't exist yet)**

```bash
npx vitest run src/test/db.migration.test.ts
```

- [ ] **Update `src/db/schema.ts`** — add M2 fields and SYNC_STATUSES

```typescript
export const SYNC_STATUSES = ['pending', 'synced'] as const
export type SyncStatus = typeof SYNC_STATUSES[number]

export interface Timer {
  id?: number
  title: string
  description: string | null
  emoji: string | null
  targetDatetime: Date
  originalTargetDatetime: Date
  status: TimerStatus
  priority: Priority
  isFlagged: boolean
  groupId: number | null
  recurrenceRule: { cron: string; tz: string } | null
  createdAt: Date
  updatedAt: Date
  // M2 sync fields
  serverId: string | null
  userId: string | null
  syncStatus: SyncStatus
  version: number | null
}
```

(Keep all existing exports above the Timer interface — add SYNC_STATUSES before it.)

- [ ] **Update `src/db/index.ts`** — add version 3 migration

```typescript
this.version(3).stores({
  timers: '++id, status, targetDatetime, priority, isFlagged, groupId, syncStatus, serverId, userId',
}).upgrade(tx =>
  tx.table('timers').toCollection().modify(timer => {
    timer.serverId = timer.serverId ?? null
    timer.userId = timer.userId ?? null
    timer.syncStatus = timer.syncStatus ?? 'synced'
    timer.version = timer.version ?? null
  })
)
```

- [ ] **Run migration test — expect PASS**

```bash
npx vitest run src/test/db.migration.test.ts
```

- [ ] **Run full test suite — ensure no regressions**

```bash
npx vitest run
```

- [ ] **Fix any tests that break** — existing test fixtures need the new required fields. Update `BASE` object in `src/test/useTimers.test.ts` and the `db.test.ts` fixture objects to include:

```typescript
serverId: null,
userId: null,
syncStatus: 'synced' as const,
version: null,
```

Also update `createTimer` in `src/hooks/useTimers.ts` to include defaults for M2 fields:

```typescript
export async function createTimer(
  data: Omit<Timer, 'id' | 'createdAt' | 'updatedAt' | 'originalTargetDatetime' | 'serverId' | 'userId' | 'syncStatus' | 'version'>,
): Promise<number | undefined> {
  const now = new Date()
  return db.timers.add({
    ...data,
    originalTargetDatetime: data.targetDatetime,
    createdAt: now,
    updatedAt: now,
    serverId: null,
    userId: null,
    syncStatus: 'synced',
    version: null,
  })
}
```

- [ ] **Run full suite again — all green**

```bash
npx vitest run
```

- [ ] **Commit**

```bash
git add src/db/schema.ts src/db/index.ts src/hooks/useTimers.ts src/test/
git commit -m "feat(frontend): Dexie v3 migration adds serverId, userId, syncStatus, version"
```
