# Milestone 4: Groups, Tags, Sorting, Views — Design Spec
_2026-05-29_

## Goal

Add user-created smart groups (saved filters), first-class tag entities, a hybrid urgency sort, and a "Group by" view mode. Introduce a generic sync adapter so all synced entities (timers, tags, groups) share one drain/reconcile loop.

---

## Scope

- **Prerequisite:** npm workspace setup — single `npm install` at root installs all packages; server deps hoisted so the frontend TypeScript build can resolve `AppRouter` without a separate `cd server && npm install`
- Remove `isFlagged` from Dexie schema, server schema, and all sync payloads
- Remove `groupId` FK from timer schema (replaced by smart group conditions)
- Tags: `tags` table + `timer_tags` join table on server; `tags` Dexie table; tag assignments travel with timer upsert
- Smart groups: user-created saved filters, Tier 2 AND-only conditions, synced
- Generic sync adapter pattern across timers, tags, groups
- Shared filter evaluator in `packages/filters/` (workspace package)
- Hybrid "Smart" sort (urgency score combining priority + time-to-fire)
- Views: "Group by" display mode (client-only, localStorage)
- iOS install prompt (carried from M3 — required before push permission on iOS)

**Out of scope for M4:** Ad-hoc filtering (groups serve that purpose), per-group sort overrides, missed timer status.

---

## Prerequisite: npm Workspace Setup

The root `package.json` currently has no `workspaces` field. `server/` and `infra/` each maintain a separate `node_modules`. This causes two problems:

1. A fresh worktree requires three separate `npm install` commands
2. The frontend TypeScript build imports `AppRouter` from `../../server/api/index` — if `server/node_modules` is absent, the compiler cannot resolve `@trpc/server` and other server-only transitive deps

Fix: add `"workspaces": ["packages/*", "server", "infra"]` to root `package.json`. All deps hoist to root `node_modules`. A single `npm install` at root covers everything.

The `packages/` directory is created for the shared filter evaluator (see §6).

---

## Decisions

### 1. Remove `isFlagged`

`isFlagged` has no UI and is redundant with `priority`. Remove from:
- `src/db/schema.ts` (Dexie schema + Timer type)
- `server/db/schema.ts` (Drizzle schema)
- `server/api/routers/timers.ts` (upsert input schema)
- `src/hooks/useSyncEngine.ts` (drain payload)
- All test fixtures

Requires a Drizzle migration to drop the column from Postgres.

### 2. Remove `groupId` FK

The `groupId` field on timers is replaced by smart group conditions (§5). Groups no longer hold membership via FK — they query for matching timers at runtime.

Remove from:
- `src/db/schema.ts` and Dexie index
- `server/db/schema.ts`
- `src/hooks/useSyncEngine.ts` (drain payload maps `groupId: null` — drop entirely)

Requires a Drizzle migration to drop the column.

### 3. Tags

**Server schema:**

`tags` table:
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | text FK → users | |
| name | text | unique per user |
| color | text \| null | hex color |
| emoji | text \| null | |
| version | int | conflict detection |
| created_at | timestamptz | |
| updated_at | timestamptz | |

`timer_tags` join table:
| Column | Type | Notes |
|---|---|---|
| timer_id | uuid FK → timers | |
| tag_id | uuid FK → tags | |
| PRIMARY KEY | (timer_id, tag_id) | |

**Dexie schema:**

`tags` table mirrors the server shape plus `syncStatus`, `serverId`, `userId`. Indexed on `syncStatus`, `userId`.

Timers in Dexie gain a `tagIds: string[]` field (array of tag `serverId` values). The frontend joins `tagIds` against the `tags` Dexie table to display tag names and colors.

**Timer-tag assignment:**

Tag assignments travel with the timer upsert payload: `tagIds: string[]`. The server diffs `tagIds` against the current `timer_tags` rows and writes inserts/deletes atomically in the same transaction. No separate sync adapter for `timer_tags` — the join table is a server concern only.

**Tag picker UI:**

The tag picker displays all existing tags for the user (populated from the `tags` Dexie table after tag reconcile). Users can select existing tags or type a new name to create a tag inline. Inline creation writes a new tag to Dexie with `syncStatus: 'pending'` — the tag adapter drains it before the timer drain to avoid FK violations on the server.

New tRPC procedures: `tags.upsert`, `tags.delete`, `tags.reconcile`.

### 4. Generic Sync Adapter

A single drain/reconcile loop replaces the timer-specific logic in `useSyncEngine`. Each synced entity provides an adapter:

```ts
interface SyncAdapter<TLocal, TServer> {
  label: string
  getPending: (userId: string) => Promise<TLocal[]>
  drain: (entity: TLocal) => Promise<{ serverId: string; version: number }>
  getConflictRecord: (serverId: string) => Promise<TServer | null>
  getServerRecords: (since: string | null, refs: RecordRef[]) => Promise<TServer[]>
  mapToLocal: (server: TServer) => Omit<TLocal, 'id'>
  updateLocal: (id: number, patch: Partial<TLocal>) => Promise<void>
  addLocal: (record: Omit<TLocal, 'id'>) => Promise<void>
}
```

**CONFLICT resolution** is uniform across all entities: server wins. On `CONFLICT` response, `getConflictRecord` fetches the server copy and `updateLocal` overwrites Dexie. No adapter-specific conflict logic.

**Drain ordering:** adapters run sequentially in declaration order — tags drain before timers (prevents FK violation when a timer references a not-yet-created server tag). Groups drain after timers.

**Timer drain routing** is encapsulated inside the timer adapter's `drain` function:
- `status: active | fired` → `timers.upsert`
- `status: completed` → `timers.complete`
- `status: cancelled` → `timers.cancel`

The generic loop calls `adapter.drain(entity)` — routing is an adapter implementation detail.

**`syncRunning` lock** covers all adapters atomically — one sync run processes all entity types before releasing.

### 5. Smart Groups

User-created saved filters. A group is a named entity with a condition tree; membership is computed at runtime by the filter evaluator.

**Server schema:**

`groups` table:
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | text FK → users | |
| name | text | |
| emoji | text \| null | |
| color | text \| null | |
| conditions | jsonb | `GroupConditions` — see §6 |
| version | int | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Groups are synced via the generic adapter (upsert/delete/reconcile). New tRPC procedures: `groups.upsert`, `groups.delete`, `groups.reconcile`.

**No `groupId` FK on timers** — membership is computed, not stored.

### 6. Shared Filter Evaluator (`packages/filters/`)

A workspace package (`@cw/filters`) containing:

1. **Condition type schema** (Tier 2 — AND-only):

```ts
type FieldCondition =
  | { field: 'tags';            op: 'contains';               value: string }
  | { field: 'priority';        op: 'eq';                     value: Priority }
  | { field: 'priority';        op: 'in';                     value: Priority[] }
  | { field: 'status';          op: 'eq';                     value: TimerStatus }
  | { field: 'status';          op: 'in';                     value: TimerStatus[] }
  | { field: 'targetDatetime';  op: 'before' | 'after';       value: string }   // ISO timestamp
  | { field: 'targetDatetime';  op: 'overdue' | 'today' }
  | { field: 'targetDatetime';  op: 'within_days';            value: number }
  | { field: 'title';           op: 'contains';               value: string }
  | { field: 'recurrenceRule';  op: 'exists' | 'not_exists' }
  | { field: 'emoji';           op: 'eq';                     value: string }

type GroupConditions = {
  op: 'AND'
  conditions: FieldCondition[]
}
```

2. **`applyFilter(timers: Timer[], conditions: GroupConditions, now: Date): Timer[]`** — evaluates conditions against an in-memory array. Used by the frontend against Dexie results, and by any Lambda that needs to evaluate group membership against fetched timer records.

Relative date operators (`overdue`, `today`, `within_days`) are evaluated against the `now` parameter — not against a saved timestamp — so they remain correct across sessions.

### 7. Hybrid "Smart" Sort

A named sort mode ("Smart") that combines `priority` and time-to-fire into a single urgency score. Applied globally — groups follow the global sort.

```
urgencyScore = priorityWeight[priority] + timeScore
timeScore = hoursUntilFire > 0 ? 10_000 / hoursUntilFire : 10_000_000  // overdue scores very high
priorityWeight = { critical: 1_000_000, high: 100_000, medium: 10_000, low: 1_000 }
```

A critical timer due in 2 weeks scores lower than a low-priority timer due in 5 minutes. Overdue timers always surface above not-yet-due timers of the same priority.

Sort mode is stored in localStorage (`cw:sortMode`). "Smart" is the default. Other available modes: `targetDatetime` (ascending), `createdAt` (descending), `priority` (descending), `title` (alphabetical).

### 8. Views (Group By)

A display mode that re-renders the timer feed as labeled sections grouped by a chosen property. No backend, no persisted entities — pure render layer.

Available group-by options:

| Mode | Sections |
|---|---|
| `none` | Flat sorted list (default) |
| `priority` | Critical / High / Medium / Low |
| `tag` | One section per tag (timer appears in each matching section) |
| `time` | Overdue / Today / This Week / Later |
| `status` | Active / Fired |

Stored in localStorage as `cw:groupBy`. Within each section, the global sort (§7) is applied.

### 9. iOS Install Prompt

iOS requires the PWA to be installed to Home Screen before `pushManager.subscribe()` is available.

Detection: `(/iPad|iPhone|iPod/.test(navigator.userAgent)) && !window.matchMedia('(display-mode: standalone)').matches`

On first visit when iOS is detected and the app is not installed: show a dismissible banner explaining that "Add to Home Screen" is required for notifications. Prompt appears before the notification permission flow is offered.

Dismissal stored in localStorage (`cw:iosPromptDismissed`). Does not re-appear once dismissed.

---

## Open Questions

1. **Tag deletion:** If a tag is deleted and timers still reference it via `timer_tags`, what is the server behavior? Cascade delete (remove from all timer associations) or soft-delete (tag record retained, hidden from picker)? TBD during M4 implementation.

2. **Group ordering:** Should users be able to manually reorder their groups in the sidebar/list? Requires an `order` field on the `groups` table. Deferred — default to `created_at` descending for now.

3. **Recurrence UI:** The create/edit timer form accepts a `recurrenceRule` but there is no documented UI for building cron expressions. TBD during M4 implementation.
