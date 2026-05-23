# Design: Dexie Migration Versioned Types & Pure Migration Functions

**Date:** 2026-05-23
**Status:** Approved

## Problem

The existing `db.migration.test.ts` has a test that checks `?? null` in isolation — it doesn't exercise any migration logic and provides false confidence. The Dexie upgrade callbacks in `src/db/index.ts` inline the backfill logic, making it impossible to unit-test without going through Dexie and fake-indexeddb.

## Goals

- Define `TimerV1`, `TimerV2`, `TimerV3` as distinct TypeScript interfaces representing the stored shape at each DB version
- Extract migration logic into pure functions (`migrateV1toV2`, `migrateV2toV3`) that can be tested without Dexie
- Keep `Timer = TimerV3` as the canonical export — no breaking changes to existing imports
- No Zod, no runtime overhead — types are compile-time only

## Out of Scope

- Zod schemas on the frontend (no untrusted data boundary; Dexie gives back typed objects)
- Sharing server-side Zod schemas with the client (would require a `shared/` package; not worth it)
- Bulk-uploading pre-M2 local records on first login (future feature; current spec leaves them as local-only)

## Architecture

### Versioned types in `src/db/schema.ts`

Three interfaces, each representing the exact stored shape at that DB version:

```ts
export interface TimerV1 {
  id?: number
  title: string
  description: string | null
  emoji: string | null
  targetDatetime: Date
  status: TimerStatus
  priority: Priority
  isFlagged: boolean
  groupId: number | null
  recurrenceRule: { cron: string; tz: string } | null
  createdAt: Date
  updatedAt: Date
}

export interface TimerV2 extends TimerV1 {
  originalTargetDatetime: Date
}

export interface TimerV3 extends TimerV2 {
  serverId: string | null
  userId: string | null
  syncStatus: SyncStatus
  version: number | null
}

export type Timer = TimerV3
```

`Timer` remains the canonical name for all existing consumers. `TimerV3` is its definition.

### Pure migration functions in `src/db/migrations.ts`

```ts
import type { TimerV1, TimerV2, TimerV3 } from './schema'

export function migrateV1toV2(timer: TimerV1): TimerV2 {
  return {
    ...timer,
    originalTargetDatetime: timer.targetDatetime,
  }
}

export function migrateV2toV3(timer: TimerV2): TimerV3 {
  return {
    ...timer,
    serverId: null,
    userId: null,
    syncStatus: 'synced',
    version: null,
  }
}
```

The `syncStatus: 'synced'` default is intentional per the M2 spec: pre-existing records have `userId: null`, so `useSyncEngine`'s `drainPending` (which filters by `userId === user.userId`) never picks them up regardless. `'synced'` is a quiescent sentinel, not a claim the record is actually on the server.

### Dexie upgrade callbacks become thin wrappers in `src/db/index.ts`

```ts
.version(2).stores({...}).upgrade(tx =>
  tx.table('timers').toCollection().modify(timer => {
    Object.assign(timer, migrateV1toV2(timer))
  })
)
.version(3).stores({...}).upgrade(tx =>
  tx.table('timers').toCollection().modify(timer => {
    Object.assign(timer, migrateV2toV3(timer))
  })
)
```

No type casts at the call site — `timer` in `modify()` is untyped at runtime; the migration function accepts the old shape directly.

### Updated migration tests in `src/test/db.migration.test.ts`

The inline `?? null` test is deleted. Tests call the pure functions directly:

```ts
import { migrateV1toV2, migrateV2toV3 } from '../db/migrations'
import type { TimerV1 } from '../db/schema'

const V1_FIXTURE = {
  title: 'Test', description: null, emoji: null,
  targetDatetime: new Date('2026-06-01T12:00:00Z'),
  status: 'active', priority: 'medium', isFlagged: false,
  groupId: null, recurrenceRule: null,
  createdAt: new Date(), updatedAt: new Date(),
} satisfies TimerV1

describe('migrations', () => {
  it('v1→v2: backfills originalTargetDatetime from targetDatetime', () => {
    const v2 = migrateV1toV2(V1_FIXTURE)
    expect(v2.originalTargetDatetime).toBe(V1_FIXTURE.targetDatetime)
  })

  it('v2→v3: backfills sync fields with correct defaults', () => {
    const v3 = migrateV2toV3({ ...V1_FIXTURE, originalTargetDatetime: V1_FIXTURE.targetDatetime })
    expect(v3.serverId).toBeNull()
    expect(v3.userId).toBeNull()
    expect(v3.syncStatus).toBe('synced')
    expect(v3.version).toBeNull()
  })
})
```

The Dexie schema test (adds/retrieves a V3 record) is kept — it validates index configuration, not migration logic.

## Why not Zod on the frontend?

- No untrusted data boundary: Dexie returns the same typed objects written to it
- Server's `timerUpsertInput` uses Zod because tRPC receives arbitrary HTTP payloads
- Adding Zod to the frontend would add ~13KB gzipped for no correctness benefit
- TypeScript provides compile-time validation; that's sufficient here

## File changes

| File | Change |
|---|---|
| `src/db/schema.ts` | Add `TimerV1`, `TimerV2`, `TimerV3`; make `Timer = TimerV3` |
| `src/db/migrations.ts` | New file: `migrateV1toV2`, `migrateV2toV3` |
| `src/db/index.ts` | Upgrade callbacks call migration functions via `Object.assign` |
| `src/test/db.migration.test.ts` | Replace inline logic test with pure-function tests; delete `?? null` test |
