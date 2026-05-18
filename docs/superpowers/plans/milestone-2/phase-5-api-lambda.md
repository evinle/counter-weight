# Phase 5: API Lambda [CODEBASE]

> Back to [index](index.md)

## Prior Phase Context

**From Phase 1 (server/ package):** Dependencies available — `@trpc/server@^11`, `fastify@^5`, `@fastify/aws-lambda@^4`, `@fastify/cors@^10`, `aws-jwt-verify@^4`, `drizzle-orm@^0.40`, `@aws-sdk/client-secrets-manager@^3`, `zod@^3.23`.

**From Phase 3 (Drizzle schema + client):**

```typescript
// server/db/schema.ts exports:
export const users     // pgTable — id (text/Cognito sub), email, settings, createdAt
export const timers    // pgTable — id (uuid), userId, title, description, emoji,
                       //   targetDatetime, originalTargetDatetime, status, priority,
                       //   isFlagged, recurrenceRule, eventbridgeScheduleId, version, createdAt, updatedAt
export const timerEvents  // pgTable — id, timerId, userId, eventType, occurredAt, metadata
export const timerStatusEnum  // 'active' | 'fired' | 'completed' | 'missed' | 'cancelled'
export const priorityEnum     // 'low' | 'medium' | 'high' | 'critical'
export const eventTypeEnum    // 'created' | 'updated' | 'rescheduled' | 'completed' | 'cancelled'

// server/db/index.ts exports:
export function createDb(connectionString: string): Db
export type Db = ReturnType<typeof createDb>
```

**From Phase 2 (AppStack env vars):** API Lambda receives these at runtime:
- `COGNITO_USER_POOL_ID` — for `aws-jwt-verify` JWKS fetching
- `COGNITO_CLIENT_ID` — token audience verification
- `DB_SECRET_ARN` — Secrets Manager ARN for DB credentials JSON
- `DB_PROXY_ENDPOINT` — RDS Proxy hostname (Lambda connects through it)

The API Lambda is inside the private VPC. Its DNS resolves `cognito-idp.<region>.amazonaws.com` to the Cognito VPC Interface Endpoint (no NAT needed) — `aws-jwt-verify` caches JWKS in memory after the first fetch and re-fetches via this endpoint on key rotation.

**Entry point path:** AppStack bundles `server/api/index.ts` as the API Lambda handler. The `AppRouter` type exported from `server/api/index.ts` is imported by the frontend tRPC client (`src/lib/trpc.ts`).

---

## Task 5.1: tRPC context (JWT verification)

**Files:**
- Create: `server/api/context.ts`

`aws-jwt-verify` caches JWKS in memory after the first fetch. With the Cognito VPC Interface Endpoint having `privateDnsEnabled: true`, the Lambda's DNS resolves `cognito-idp.<region>.amazonaws.com` to the private endpoint automatically — no code change needed.

- [ ] **Create `server/api/context.ts`**

```typescript
import { CognitoJwtVerifier } from 'aws-jwt-verify'
import type { FastifyRequest } from 'fastify'
import { createDb } from '../db/index.js'
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import type { Db } from '../db/index.js'

let _db: Db | null = null

async function getDb(): Promise<Db> {
  if (_db) return _db

  const sm = new SecretsManagerClient({})
  const secret = await sm.send(
    new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN }),
  )
  const { username, password, host, port, dbname } = JSON.parse(
    secret.SecretString!,
  )
  const proxyEndpoint = process.env.DB_PROXY_ENDPOINT!
  const url = `postgresql://${username}:${encodeURIComponent(password)}@${proxyEndpoint}:${port}/${dbname}?sslmode=require`

  _db = createDb(url)
  return _db
}

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID!,
  tokenUse: 'id',
  clientId: process.env.COGNITO_CLIENT_ID!,
})

export async function createContext({ req }: { req: FastifyRequest }) {
  const db = await getDb()
  const auth = req.headers.authorization

  if (!auth?.startsWith('Bearer ')) return { userId: null, db }

  try {
    const payload = await verifier.verify(auth.slice(7))
    return { userId: payload.sub as string, db }
  } catch {
    return { userId: null, db }
  }
}

export type Context = Awaited<ReturnType<typeof createContext>>
```

- [ ] **Commit**

```bash
git add server/api/context.ts
git commit -m "feat(server): add tRPC context with JWKS caching JWT verification"
```

---

## Task 5.2: tRPC router + middleware

**Files:**
- Create: `server/api/router.ts`

- [ ] **Create `server/api/router.ts`**

```typescript
import { initTRPC, TRPCError } from '@trpc/server'
import type { Context } from './context.js'

const t = initTRPC.context<Context>().create()

export const router = t.router
export const publicProcedure = t.procedure

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { ...ctx, userId: ctx.userId } })
})
```

- [ ] **Commit**

```bash
git add server/api/router.ts
git commit -m "feat(server): add tRPC init with protectedProcedure middleware"
```

---

## Task 5.3: auth.bootstrap procedure (with test)

**Files:**
- Create: `server/api/routers/auth.ts`
- Create: `server/api/routers/auth.test.ts`

- [ ] **Write the failing test**

Create `server/api/routers/auth.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { createCallerFactory, TRPCError } from '@trpc/server'
import { authRouter } from './auth.js'
import { router } from '../router.js'

const testRouter = router({ auth: authRouter })
const createCaller = createCallerFactory(testRouter)

function makeCtx(userId: string | null, dbValues?: any[]) {
  const mockReturning = vi.fn().mockResolvedValue(dbValues ?? [])
  const mockValues = vi.fn().mockReturnValue({ onConflictDoUpdate: vi.fn().mockResolvedValue([]) })
  const mockInsert = vi.fn().mockReturnValue({ values: mockValues })

  return { userId, db: { insert: mockInsert } as any }
}

describe('auth.bootstrap', () => {
  it('throws UNAUTHORIZED when not authenticated', async () => {
    const caller = createCaller(makeCtx(null))
    await expect(
      caller.auth.bootstrap({ email: 'user@example.com' }),
    ).rejects.toThrow(TRPCError)
  })

  it('upserts the user row when authenticated', async () => {
    const ctx = makeCtx('user-sub-123')
    const caller = createCaller(ctx)
    const result = await caller.auth.bootstrap({ email: 'user@example.com' })
    expect(result).toEqual({ ok: true })
    expect(ctx.db.insert).toHaveBeenCalled()
  })
})
```

- [ ] **Run — expect FAIL (module not found)**

```bash
cd server && npm test -- server/api/routers/auth.test.ts
```

- [ ] **Create `server/api/routers/auth.ts`**

```typescript
import { z } from 'zod'
import { router, protectedProcedure } from '../router.js'
import { users } from '../../db/schema.js'

export const authRouter = router({
  bootstrap: protectedProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(users)
        .values({ id: ctx.userId, email: input.email })
        .onConflictDoUpdate({ target: users.id, set: { email: input.email } })
      return { ok: true }
    }),
})
```

- [ ] **Run — expect PASS**

```bash
cd server && npm test -- server/api/routers/auth.test.ts
```

- [ ] **Commit**

```bash
git add server/api/routers/auth.ts server/api/routers/auth.test.ts
git commit -m "feat(server): add auth.bootstrap tRPC procedure"
```

---

## Task 5.4: timers CRUD procedures (with tests)

**Files:**
- Create: `server/api/routers/timers.ts`
- Create: `server/api/routers/timers.test.ts`

- [ ] **Write the failing tests**

Create `server/api/routers/timers.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { createCallerFactory, TRPCError } from '@trpc/server'
import { timersRouter } from './timers.js'
import { router } from '../router.js'

const testRouter = router({ timers: timersRouter })
const createCaller = createCallerFactory(testRouter)

const BASE_INPUT = {
  serverId: null as string | null,
  title: 'Test timer',
  description: null,
  emoji: null,
  targetDatetime: '2026-06-01T12:00:00Z',
  originalTargetDatetime: '2026-06-01T12:00:00Z',
  status: 'active' as const,
  priority: 'medium' as const,
  isFlagged: false,
  recurrenceRule: null,
  version: undefined as number | undefined,
}

function mockInsertChain(returning: any[]) {
  const mockReturning = vi.fn().mockResolvedValue(returning)
  const mockValues = vi.fn().mockReturnValue({ returning: mockReturning })
  return { insert: vi.fn().mockReturnValue({ values: mockValues }) }
}

function mockSelectChain(rows: any[]) {
  const mockWhere = vi.fn().mockResolvedValue(rows)
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
  return { select: vi.fn().mockReturnValue({ from: mockFrom }) }
}

describe('timers.upsert', () => {
  it('throws UNAUTHORIZED when unauthenticated', async () => {
    const caller = createCaller({ userId: null, db: {} as any })
    await expect(caller.timers.upsert(BASE_INPUT)).rejects.toThrow(TRPCError)
  })

  it('creates a new server timer when serverId is null', async () => {
    const insertDb = mockInsertChain([{ serverId: 'srv-uuid', version: 1 }])
    // Second insert is for timer_events — mock it too
    let callCount = 0
    const insertMock = vi.fn().mockImplementation(() => {
      const returning = callCount++ === 0
        ? vi.fn().mockResolvedValue([{ serverId: 'srv-uuid', version: 1 }])
        : vi.fn().mockResolvedValue([])
      const values = vi.fn().mockReturnValue({ returning })
      return { values }
    })

    const caller = createCaller({ userId: 'u1', db: { insert: insertMock } as any })
    const result = await caller.timers.upsert(BASE_INPUT)

    expect(result.serverId).toBe('srv-uuid')
    expect(result.version).toBe(1)
    expect(insertMock).toHaveBeenCalledTimes(2) // timers + timer_events
  })

  it('throws CONFLICT when version does not match (atomic UPDATE returns zero rows)', async () => {
    // Atomic update: WHERE includes version, returns [] when version mismatches
    const updateMock = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]), // zero rows → CONFLICT
        }),
      }),
    })

    const caller = createCaller({
      userId: 'u1',
      db: { update: updateMock } as any,
    })

    await expect(
      caller.timers.upsert({ ...BASE_INPUT, serverId: 'existing-uuid', version: 3 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
})

describe('timers.complete', () => {
  it('throws CONFLICT when version mismatches (atomic UPDATE returns zero rows)', async () => {
    const updateMock = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    })

    const caller = createCaller({ userId: 'u1', db: { update: updateMock } as any })
    await expect(
      caller.timers.complete({ serverId: 'srv-uuid', version: 1 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
})
```

- [ ] **Run — expect FAIL (module not found)**

```bash
cd server && npm test -- server/api/routers/timers.test.ts
```

- [ ] **Create `server/api/routers/timers.ts`**

```typescript
import { z } from 'zod'
import { and, eq, gt, ne, sql } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../router.js'
import { timers, timerEvents } from '../../db/schema.js'

const timerUpsertInput = z.object({
  serverId: z.string().uuid().nullable(),
  title: z.string().min(1),
  description: z.string().nullable(),
  emoji: z.string().nullable(),
  targetDatetime: z.string().datetime(),
  originalTargetDatetime: z.string().datetime(),
  status: z.enum(['active', 'fired', 'completed', 'missed', 'cancelled']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  isFlagged: z.boolean(),
  recurrenceRule: z.object({ cron: z.string(), tz: z.string() }).nullable(),
  version: z.number().int().optional(),
})

export const timersRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(timers)
      .where(and(eq(timers.userId, ctx.userId), ne(timers.status, 'cancelled')))
  }),

  get: protectedProcedure
    .input(z.object({ serverId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [timer] = await ctx.db
        .select()
        .from(timers)
        .where(and(eq(timers.id, input.serverId), eq(timers.userId, ctx.userId)))
      return timer ?? null
    }),

  upsert: protectedProcedure
    .input(timerUpsertInput)
    .mutation(async ({ ctx, input }) => {
      if (input.serverId) {
        // Single atomic UPDATE: version check + increment in one query.
        // If input.version is provided, WHERE clause includes it — zero rows → 409.
        // No separate SELECT needed; this is safe under Lambda concurrency.
        const whereClause = input.version !== undefined
          ? and(
              eq(timers.id, input.serverId),
              eq(timers.userId, ctx.userId),
              eq(timers.version, input.version),
            )
          : and(eq(timers.id, input.serverId), eq(timers.userId, ctx.userId))

        const [updated] = await ctx.db
          .update(timers)
          .set({
            title: input.title,
            description: input.description,
            emoji: input.emoji,
            targetDatetime: new Date(input.targetDatetime),
            status: input.status,
            priority: input.priority,
            isFlagged: input.isFlagged,
            recurrenceRule: input.recurrenceRule,
            version: sql`${timers.version} + 1`,
            updatedAt: new Date(),
          })
          .where(whereClause)
          .returning({ serverId: timers.id, version: timers.version })

        if (!updated) throw new TRPCError({ code: 'CONFLICT', message: 'Version mismatch or not found' })
        return updated
      }

      // TODO(M3): when clientId is added to the client, add a dedup check here:
      // SELECT WHERE userId = ctx.userId AND clientId = input.clientId LIMIT 1
      // Return the existing record if found to make creation idempotent.
      const [created] = await ctx.db
        .insert(timers)
        .values({
          userId: ctx.userId,
          title: input.title,
          description: input.description,
          emoji: input.emoji,
          targetDatetime: new Date(input.targetDatetime),
          originalTargetDatetime: new Date(input.originalTargetDatetime),
          status: input.status,
          priority: input.priority,
          isFlagged: input.isFlagged,
          recurrenceRule: input.recurrenceRule,
        })
        .returning({ serverId: timers.id, version: timers.version })

      await ctx.db.insert(timerEvents).values({
        timerId: created.serverId,
        userId: ctx.userId,
        eventType: 'created',
      })

      return created
    }),

  complete: protectedProcedure
    .input(z.object({ serverId: z.string().uuid(), version: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      // Atomic: version check in WHERE; zero rows → 409
      const [updated] = await ctx.db
        .update(timers)
        .set({ status: 'completed', version: sql`${timers.version} + 1`, updatedAt: new Date() })
        .where(and(
          eq(timers.id, input.serverId),
          eq(timers.userId, ctx.userId),
          eq(timers.version, input.version),
        ))
        .returning({ id: timers.id })

      if (!updated) throw new TRPCError({ code: 'CONFLICT' })

      await ctx.db.insert(timerEvents).values({
        timerId: input.serverId,
        userId: ctx.userId,
        eventType: 'completed',
      })

      return { ok: true }
    }),

  cancel: protectedProcedure
    .input(z.object({ serverId: z.string().uuid(), version: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      // Atomic: version check in WHERE; zero rows → 409
      const [updated] = await ctx.db
        .update(timers)
        .set({ status: 'cancelled', version: sql`${timers.version} + 1`, updatedAt: new Date() })
        .where(and(
          eq(timers.id, input.serverId),
          eq(timers.userId, ctx.userId),
          eq(timers.version, input.version),
        ))
        .returning({ id: timers.id })

      if (!updated) throw new TRPCError({ code: 'CONFLICT' })

      await ctx.db.insert(timerEvents).values({
        timerId: input.serverId,
        userId: ctx.userId,
        eventType: 'cancelled',
      })

      return { ok: true }
    }),

  reconcile: protectedProcedure
    .input(
      z.object({
        since: z.string().datetime().nullable(),
        records: z.array(
          z.object({ serverId: z.string().uuid(), updatedAt: z.string().datetime() }),
        ),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(timers.userId, ctx.userId)]
      if (input.since) conditions.push(gt(timers.updatedAt, new Date(input.since)))

      const serverRecords = await ctx.db
        .select()
        .from(timers)
        .where(and(...conditions))

      const clientMap = new Map(
        input.records.map((r) => [r.serverId, new Date(r.updatedAt)]),
      )

      return serverRecords.filter((sr) => {
        const clientUpdatedAt = clientMap.get(sr.id)
        return !clientUpdatedAt || sr.updatedAt > clientUpdatedAt
      })
    }),
})
```

- [ ] **Run tests — expect PASS**

```bash
cd server && npm test -- server/api/routers/timers.test.ts
```

- [ ] **Commit**

```bash
git add server/api/routers/timers.ts server/api/routers/timers.test.ts
git commit -m "feat(server): add timer CRUD + reconcile tRPC procedures"
```

---

## Task 5.5: API Lambda handler + root router

**Files:**
- Create: `server/api/index.ts`

- [ ] **Create `server/api/index.ts`**

```typescript
import Fastify from 'fastify'
import awsLambdaFastify from '@fastify/aws-lambda'
import cors from '@fastify/cors'
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify'
import { createContext } from './context.js'
import { authRouter } from './routers/auth.js'
import { timersRouter } from './routers/timers.js'
import { router } from './router.js'

export const appRouter = router({
  auth: authRouter,
  timers: timersRouter,
})

export type AppRouter = typeof appRouter

const app = Fastify({ logger: true })

app.register(cors, {
  origin: ['http://localhost:5174', 'https://counter-weight.app'],
  credentials: true,
})

app.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: { router: appRouter, createContext },
})

export const handler = awsLambdaFastify(app)
```

- [ ] **Verify TypeScript compiles without errors**

```bash
cd server && npm run typecheck
```

Expected: no output (no errors).

- [ ] **Commit**

```bash
git add server/api/index.ts
git commit -m "feat(server): add API Lambda handler with tRPC adapter"
```
