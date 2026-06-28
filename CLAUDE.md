# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Staleness check** — this file was last updated at commit `fbb877f` (2026-06-25). Before relying on the architecture section, run `git log --oneline fbb877f..HEAD` — if significant commits have landed in `src/`, `server/`, or `infra/`, re-read those files rather than trusting the description below.

## Commands

### Frontend (root)
```bash
npm run dev        # Vite dev server on 0.0.0.0:5174 (HTTPS via mkcert certs)
npm run dev:local  # same but proxies API to http://localhost:3000
npm run build      # tsc + Vite production build
npm run lint       # ESLint
npm run test       # Vitest watch mode
npx vitest run     # Vitest single run
npx vitest run src/test/countdown.test.ts  # single test file
npm run deploy     # build frontend (reads .env.production) + wrangler deploy to Cloudflare
```

### Server (`server/`)
```bash
cd server
npm test                # vitest run (single pass)
npm run typecheck       # tsc --noEmit
npm run migrate         # drizzle-kit migrate — requires DATABASE_URL in env
npm run migrate:neon    # migrate via Neon HTTP driver (reads NEON_SECRET_ARN from server/.env)
```

`migrate:neon` uses `@neondatabase/serverless` (HTTP transport) — bypasses TCP so it works from environments where port 5432 is blocked. Reads `NEON_SECRET_ARN` from `server/.env`, fetches the connection string from Secrets Manager, then runs migrations programmatically via `drizzle-orm/neon-http/migrator`. Use this for local migration runs against the Neon database.

### Infrastructure (`infra/`)
```bash
cd infra
npx cdk deploy StorageStack   # Cognito, Neon SM secret reference
npx cdk deploy AppStack --context cognitoClientSecretArn=<ARN>  # Lambdas, API Gateway
```

`AppStack` requires `cognitoClientSecretArn` in context — see comment in `infra/lib/app-stack.ts`.

## Architecture

This is a **local-first timer PWA** with an optional cloud sync backend. The repo is an npm workspace with five packages: frontend (`src/`), server (`server/`), infra (`infra/`), and two shared libraries under `packages/`:

| Package | Import alias | Role |
|---------|-------------|------|
| `packages/filters` | `@cw/filters` | `FieldCondition` / `GroupConditions` types, Zod schemas, and `applyFilter` evaluator for smart-group conditions |
| `packages/recurrence` | `@cw/recurrence` | Cron-builder helpers (`buildDailyCron`, etc.) and `computeNextOccurrence` (powered by `croner`) |

Both packages are consumed by the frontend and by `server/api/`.

### Frontend data flow

```
Dexie (IndexedDB)
  └── useLiveQuery (dexie-react-hooks)  ← reactive queries in App.tsx
        └── App.tsx  ← calls timerStore.sync() + posts SYNC_TIMERS to SW
              ├── timerStore (Zustand)  ← schedules setTimeout, surfaces firedTimer
              └── sw.ts (Service Worker) ← independent setTimeout for background notifications
```

`App.tsx` is the only bridge between Dexie and the rest of the system. On every Dexie snapshot it: (1) calls `sync(activeTimers)` to update the Zustand store, and (2) posts `SYNC_TIMERS` to the service worker for background notifications.

**Dual notification paths:**
- **Foreground**: `firedTimer` in Zustand → `App.tsx` shows toast + calls `showNotification` via SW
- **Background**: `sw.ts` runs its own `setTimeout` map and calls `showNotification` directly

### Sync engine

`useSyncEngine` (`src/hooks/useSyncEngine.ts`) runs on login and on `online`/`visibilitychange`. Two phases:

1. **Drain pending** — pushes local records with `syncStatus: 'pending'` (or `'deleted'`) to the server. On `CONFLICT`, server wins: fetches the server record and overwrites Dexie.
2. **Reconcile** — calls the server `reconcile` procedure with `since` (last sync timestamp) and local `{serverId, updatedAt}` pairs to pull stale/missing records down.

Sync runs through a generic `SyncAdapter<TLocal, TServer>` interface. A `PIPELINE` array runs three adapters in order — `tagAdapter`, `groupAdapter`, `timerAdapter` — so each phase (drain, reconcile) processes all entity types uniformly. Soft-deletes use `SyncStatuses.Deleted`; the adapter filters these out during reconcile to prevent resurrection.

Local records carry `syncStatus`, `serverId`, and `version`. Guest users skip sync entirely.

### Auth flow

1. Frontend redirects to Cognito hosted UI (`useAuth.login()`)
2. Cognito redirects back to `/auth/callback` in the frontend with `?code=`
3. Frontend POSTs `{ code, origin }` to `api.evinle.app/auth/callback` (auth Lambda)
4. Auth Lambda exchanges the code with Cognito and sets an `httpOnly` `refresh_token` cookie
5. Frontend stores the returned `idToken` in memory (`src/lib/trpc.ts:idToken`)
6. tRPC calls attach `Authorization: Bearer <idToken>`; on 401 the client auto-refreshes via `/auth/refresh` — concurrent refreshes share one in-flight promise to avoid Cognito rotation races

Cookie domain: `SameSite=Lax`, `Domain=evinle.app` in prod (omitted for localhost — see `server/auth/routes.ts`).

### Server

Fastify on AWS Lambda via `@fastify/aws-lambda`. Three separate Lambda functions:

| Lambda | Entry | Handles |
|--------|-------|---------|
| `AuthLambda` | `server/auth/index.ts` | `/auth/*` — Cognito OAuth, cookie management |
| `ApiLambda` | `server/api/index.ts` | `/trpc/*` — tRPC procedures, DB access; also manages EventBridge Scheduler schedules |
| `NotifyLambda` | `server/notify/index.ts` | Invoked by EventBridge Scheduler to send push notifications via Web Push |

API Gateway HTTP API routes `/auth/{proxy+}` without a JWT authorizer and `/trpc/{proxy+}` with a Cognito JWT authorizer. An explicit `OPTIONS /trpc/{proxy+}` route without an authorizer bypasses the JWT check for CORS preflights (API Gateway runs the authorizer before its own CORS handling).

**tRPC context** (`server/api/context.ts`): verifies the Bearer token with `aws-jwt-verify`, exposes `{ userId, db }`. `protectedProcedure` throws `UNAUTHORIZED` if `userId` is null.

**Notification scheduling**: on timer upsert, API Lambda calls `createTimerSchedules` which creates up to two EventBridge Scheduler one-time schedules per timer — one at `leadDatetime` (deadline minus `leadTimeMs`) and one at `targetDatetime`. Schedules invoke `NotifyLambda` via an IAM role (`EventBridgeSchedulerRole`). Completing or cancelling a timer deletes its schedules.

**Database**: Drizzle ORM + PostgreSQL ([Neon](https://neon.tech) serverless). Connection string stored in AWS Secrets Manager (`counter-weight/neon-db-secret`), read at Lambda cold start. Schema in `server/db/schema.ts`; migrations in `server/db/migrations/`. `server/drizzle.config.ts` points drizzle-kit at the DB.

### Infrastructure (CDK)

Two stacks in deployment order:

1. **`StorageStack`** (`infra/lib/storage-stack.ts`) — Cognito User Pool + App Client (Google IdP), Neon SM secret reference
2. **`AppStack`** (`infra/lib/app-stack.ts`) — Auth Lambda, API Lambda, API Gateway HTTP API, ACM cert + custom domain `api.evinle.app`, API mapping

`api.evinle.app` Cloudflare DNS must be **proxy-off** (grey cloud) — API Gateway terminates TLS directly.

### Frontend deployment

Frontend is deployed to **Cloudflare Workers** (static assets) via `wrangler`. `wrangler.jsonc` sets `not_found_handling: "single-page-application"` for client-side routing. Build env vars (`VITE_API_URL`, `VITE_COGNITO_DOMAIN`, `VITE_COGNITO_CLIENT_ID`, `VITE_VAPID_PUBLIC_KEY`) are baked in at build time — sourced from `.env.production` (committed). Do **not** inline them in the `build:frontend` script. `vite.config.ts` has a `buildStart` plugin that fails the build immediately if any required `VITE_*` var is missing.

### Key files

| Path | Role |
|------|------|
| `src/db/schema.ts` | `Timer` (= `TimerV6`), `Tag`, `Group` types; `TimerStatus`/`Priority`/`SyncStatus`/`TimerType` const-enums; versioned migration interfaces `TimerV1`–`TimerV6` |
| `src/hooks/useTimers.ts` | CRUD helpers and `useActiveTimers` live query |
| `src/hooks/useTags.ts` | Tag CRUD and live query |
| `src/hooks/useGroups.ts` | Group (smart group) CRUD and live query |
| `src/hooks/useNotifications.ts` | Push notification permission flow and subscription registration |
| `src/store/timerStore.ts` | Zustand — in-memory timer mirror, `setTimeout` scheduling, `firedTimer` surface |
| `src/store/authStore.ts` | Zustand — synchronous auth state (`user`, `lastUser`); persistence subscriber |
| `src/hooks/useAuth.ts` | Auth actions (login, loginSilent, logout, bootstrap) wired to `authStore` |
| `src/hooks/useSyncEngine.ts` | Dexie ↔ server sync via `SyncAdapter` PIPELINE (tags → groups → timers) |
| `src/lib/trpc.ts` | tRPC client with auth header injection and 401 auto-refresh |
| `src/lib/api.ts` | `fetchFromBackend` — raw fetch helper for auth endpoints |
| `server/auth/routes.ts` | `/auth/callback`, `/auth/refresh`, `/auth/logout` |
| `server/api/routers/timers.ts` | tRPC `timers.*` procedures + EventBridge schedule management |
| `server/api/routers/tags.ts` | tRPC `tags.*` procedures |
| `server/api/routers/groups.ts` | tRPC `groups.*` procedures |
| `server/notify/handler.ts` | Notify Lambda handler — reads push subscriptions, sends Web Push |
| `server/api/context.ts` | JWT verification + DB singleton per Lambda instance |
| `server/env.ts` | Zod env schemas; `getAuthEnv()` / `getApiEnv()` singletons |
| `infra/lib/storage-stack.ts` | RDS + Cognito resources |
| `infra/lib/app-stack.ts` | API Gateway + Lambda resources + EventBridge Scheduler IAM |

### Patterns

**Const-enum pattern** — use a `const` object + `satisfies` for all string enums (not plain unions):
```ts
export const Tab = {
  Timers: 'timers',
  History: 'history',
} as const satisfies Record<string, typeof ALL_TABS[number]>
export type Tab = typeof Tab[keyof typeof Tab]
```

**Type guards** — pair every union type with an `isX(v)` guard (see `isTimerStatus`, `isPriority`, `isHistoryStatus` in `src/db/schema.ts`).

### Testing

Frontend tests use `jsdom` + `fake-indexeddb` (configured in `src/test/setup.ts`). Server tests use `vitest` with real types; env helpers in `server/test/envHelpers.ts`. Vitest config is separate from Vite (`vitest.config.ts`).

See `docs/agents/testing-standards.md` for standards on fakes, state-based assertions, AAA, and test pollution. Apply when writing new tests or when working in an existing test file.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`https://github.com/evinle/counter-weight`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context repo — `CONTEXT-MAP.md` at the root points to per-package `CONTEXT.md` files (`src/`, `server/`, `infra/`). See `docs/agents/domain.md`.
