# Dexie Migration Versioned Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract Dexie migration backfill logic into pure typed functions and define per-version Timer interfaces so migrations are unit-testable without Dexie.

**Architecture:** Add `TimerV1`, `TimerV2`, `TimerV3` interfaces to `src/db/schema.ts` with `Timer = TimerV3` keeping the existing export unchanged. Create `src/db/migrations.ts` with pure `migrateV1toV2` / `migrateV2toV3` functions. Update the Dexie upgrade callbacks to call these functions via `Object.assign`. Replace the hollow inline-logic test with real pure-function assertions.

**Tech Stack:** TypeScript, Dexie 4, Vitest, fake-indexeddb

---

## File Map

| File | Change |
|---|---|
| `src/db/schema.ts` | Add `TimerV1`, `TimerV2`, `TimerV3`; change `Timer` to a type alias for `TimerV3` |
| `src/db/migrations.ts` | New — `migrateV1toV2`, `migrateV2toV3` pure functions |
| `src/db/index.ts` | Upgrade callbacks delegate to migration functions |
| `src/test/db.migration.test.ts` | Replace hollow test with pure-function assertions |

---

## Task 1: Add versioned Timer interfaces to schema.ts

**Files:**
- Modify: `src/db/schema.ts`

The existing `Timer` interface becomes `TimerV3`. `Timer` becomes a type alias so all existing imports keep working.

- [ ] **Replace the `Timer` interface in `src/db/schema.ts`**

Open `src/db/schema.ts`. Replace everything from `export interface Timer {` through the closing `}` (lines 13–31) with the following block. Leave all other content (enums, `SyncStatus`, `HISTORY_STATUSES`, etc.) untouched:

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

- [ ] **Run the type checker**

```bash
npx tsc --noEmit
```

Expected: zero errors. All files that import `Timer` continue to work because `Timer = TimerV3` is structurally identical to the old `Timer` interface.

- [ ] **Commit**

```bash
git add src/db/schema.ts
git commit -m "feat(db): add TimerV1/V2/V3 interfaces; Timer = TimerV3"
```

---

## Task 2: Create pure migration functions

**Files:**
- Create: `src/db/migrations.ts`
- Create: `src/test/db.migration.test.ts` (rewrite — see Task 4 for final state; we write tests first here)

- [ ] **Write the failing tests first**

Replace the entire contents of `src/test/db.migration.test.ts` with:

```ts
import { describe, it, expect } from 'vitest'
import { migrateV1toV2, migrateV2toV3 } from '../db/migrations'
import type { TimerV1 } from '../db/schema'

const V1_FIXTURE = {
  title: 'Test',
  description: null,
  emoji: null,
  targetDatetime: new Date('2026-06-01T12:00:00Z'),
  status: 'active',
  priority: 'medium',
  isFlagged: false,
  groupId: null,
  recurrenceRule: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
} satisfies TimerV1

describe('migrateV1toV2', () => {
  it('copies targetDatetime into originalTargetDatetime', () => {
    const v2 = migrateV1toV2(V1_FIXTURE)
    expect(v2.originalTargetDatetime).toBe(V1_FIXTURE.targetDatetime)
  })

  it('preserves all V1 fields', () => {
    const v2 = migrateV1toV2(V1_FIXTURE)
    expect(v2.title).toBe('Test')
    expect(v2.status).toBe('active')
    expect(v2.groupId).toBeNull()
  })
})

describe('migrateV2toV3', () => {
  const V2_FIXTURE = {
    ...V1_FIXTURE,
    originalTargetDatetime: V1_FIXTURE.targetDatetime,
  }

  it('sets serverId to null', () => {
    expect(migrateV2toV3(V2_FIXTURE).serverId).toBeNull()
  })

  it('sets userId to null', () => {
    expect(migrateV2toV3(V2_FIXTURE).userId).toBeNull()
  })

  it('sets syncStatus to synced', () => {
    expect(migrateV2toV3(V2_FIXTURE).syncStatus).toBe('synced')
  })

  it('sets version to null', () => {
    expect(migrateV2toV3(V2_FIXTURE).version).toBeNull()
  })

  it('preserves all V2 fields', () => {
    const v3 = migrateV2toV3(V2_FIXTURE)
    expect(v3.title).toBe('Test')
    expect(v3.originalTargetDatetime).toBe(V1_FIXTURE.targetDatetime)
  })
})
```

- [ ] **Run — expect FAIL (module not found)**

```bash
npx vitest run src/test/db.migration.test.ts
```

Expected: `Cannot find module '../db/migrations'`

- [ ] **Create `src/db/migrations.ts`**

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

- [ ] **Run — expect PASS**

```bash
npx vitest run src/test/db.migration.test.ts
```

Expected: all 7 tests pass.

- [ ] **Commit**

```bash
git add src/db/migrations.ts src/test/db.migration.test.ts
git commit -m "feat(db): pure migration functions migrateV1toV2 / migrateV2toV3 with tests"
```

---

## Task 3: Wire migration functions into Dexie upgrade callbacks

**Files:**
- Modify: `src/db/index.ts`

- [ ] **Update `src/db/index.ts`**

Replace the full file contents with:

```ts
import Dexie, { type EntityTable } from 'dexie'
import type { Timer } from './schema'
import { migrateV1toV2, migrateV2toV3 } from './migrations'

class CounterWeightDB extends Dexie {
  timers!: EntityTable<Timer, 'id'>

  constructor() {
    super('counter-weight')
    this.version(1).stores({
      timers: '++id, status, targetDatetime, priority, isFlagged, groupId',
    })
    this.version(2).stores({
      timers: '++id, status, targetDatetime, priority, isFlagged, groupId',
    }).upgrade(tx =>
      tx.table('timers').toCollection().modify(timer => {
        Object.assign(timer, migrateV1toV2(timer))
      })
    )
    this.version(3).stores({
      timers: '++id, status, targetDatetime, priority, isFlagged, groupId, syncStatus, serverId, userId',
    }).upgrade(tx =>
      tx.table('timers').toCollection().modify(timer => {
        Object.assign(timer, migrateV2toV3(timer))
      })
    )
  }
}

export const db = new CounterWeightDB()
```

- [ ] **Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass, including the existing `db.test.ts` and `db.migration.test.ts`.

- [ ] **Run the type checker**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Commit**

```bash
git add src/db/index.ts
git commit -m "refactor(db): Dexie upgrade callbacks delegate to pure migration functions"
```
