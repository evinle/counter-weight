# Phase 3: Server Database [CODEBASE]

> Back to [index](index.md)

## Prior Phase Context

From Phase 1, `server/` is initialised with:
- `server/package.json` — `drizzle-orm@^0.40.0`, `postgres@^3.4.0`, devDep `drizzle-kit@^0.30.0`
- `server/tsconfig.json` — target ES2022, module NodeNext, rootDir "."
- `server/drizzle.config.ts` — schema: `./db/schema.ts`, out: `./db/migrations`, dialect: `postgresql`

The migration script (`npm run migrate` in `server/`) calls `drizzle-kit migrate`. Task 3.3 uses `drizzle-kit generate` (schema-only, no DB connection needed) to produce the SQL migration file.

---

## Task 3.1: Drizzle schema

**Files:**
- Create: `server/db/schema.ts`

- [ ] **Create `server/db/schema.ts`**

```typescript
import {
  pgTable, pgEnum, text, uuid, timestamp, integer, boolean, jsonb, index,
} from 'drizzle-orm/pg-core'

export const timerStatusEnum = pgEnum('timer_status', [
  'active', 'fired', 'completed', 'missed', 'cancelled',
])
export const priorityEnum = pgEnum('priority', [
  'low', 'medium', 'high', 'critical',
])
export const eventTypeEnum = pgEnum('event_type', [
  'created', 'updated', 'rescheduled', 'completed', 'cancelled',
])

export const users = pgTable('users', {
  id: text('id').primaryKey(), // Cognito sub
  email: text('email').notNull(),
  settings: jsonb('settings').default('{}'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const timers = pgTable(
  'timers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id),
    groupId: uuid('group_id'), // no FK until M4
    title: text('title').notNull(),
    description: text('description'),
    emoji: text('emoji'),
    targetDatetime: timestamp('target_datetime', { withTimezone: true }).notNull(),
    originalTargetDatetime: timestamp('original_target_datetime', { withTimezone: true }).notNull(),
    status: timerStatusEnum('status').notNull().default('active'),
    priority: priorityEnum('priority').notNull().default('medium'),
    isFlagged: boolean('is_flagged').notNull().default(false),
    recurrenceRule: jsonb('recurrence_rule'),
    eventbridgeScheduleId: text('eventbridge_schedule_id'), // M3 populates this
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('timers_user_status_idx').on(t.userId, t.status),
    index('timers_updated_at_idx').on(t.updatedAt),
  ],
)

export const timerEvents = pgTable('timer_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  timerId: uuid('timer_id').notNull().references(() => timers.id),
  userId: text('user_id').notNull().references(() => users.id),
  eventType: eventTypeEnum('event_type').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb('metadata').default('{}'),
})
```

- [ ] **Commit**

```bash
git add server/db/schema.ts
git commit -m "feat(server): add Drizzle schema (users, timers, timer_events)"
```

---

## Task 3.2: Drizzle client factory

**Files:**
- Create: `server/db/index.ts`

- [ ] **Create `server/db/index.ts`**

```typescript
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'

export function createDb(connectionString: string) {
  const client = postgres(connectionString, { max: 1 }) // max 1 for Lambda
  return drizzle(client, { schema })
}

export type Db = ReturnType<typeof createDb>
```

- [ ] **Commit**

```bash
git add server/db/index.ts
git commit -m "feat(server): add Drizzle client factory"
```

---

## Task 3.3: Generate and commit initial migration

Generates the SQL migration from the schema file — no database connection required.

- [ ] **Generate the migration**

```bash
cd server && npx drizzle-kit generate
```

Expected: `server/db/migrations/0000_initial.sql` created (or similar filename).

- [ ] **Commit the generated migration**

```bash
git add server/db/migrations/
git commit -m "feat(server): add initial Drizzle migration (users, timers, timer_events)"
```
