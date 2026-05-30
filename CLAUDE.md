# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Staleness check** — this file was last updated at commit `14e30ac` (2026-05-27). Before relying on the architecture section, run `git log --oneline 14e30ac..HEAD` — if significant commits have landed in `src/`, `server/`, or `infra/`, re-read those files rather than trusting the description below.

## Commands

### Frontend (root)
```bash
npm run dev        # Vite dev server on 0.0.0.0:5174 (HTTPS via mkcert certs)
npm run build      # tsc + Vite production build
npm run lint       # ESLint
npm run test       # Vitest watch mode
npx vitest run     # Vitest single run
npx vitest run src/test/countdown.test.ts  # single test file
npm run deploy     # build frontend with prod env vars + wrangler deploy to Cloudflare
```

### Server (`server/`)
```bash
cd server
npm test           # vitest run (single pass)
npm run typecheck  # tsc --noEmit
npm run migrate    # drizzle-kit migrate (runs pending SQL migrations against DB)
```

### Infrastructure (`infra/`)
```bash
cd infra
npx cdk deploy StorageStack   # RDS, Cognito, VPC
npx cdk deploy AppStack --context cognitoClientSecretArn=<ARN>  # Lambdas, API Gateway
```

`AppStack` requires `cognitoClientSecretArn` in context — see comment in `infra/lib/app-stack.ts`.

## Architecture

This is a **local-first timer PWA** with an optional cloud sync backend. Three packages share one repo: frontend (`src/`), server (`server/`), infra (`infra/`).

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

1. **Drain pending** — pushes local `syncStatus: 'pending'` timers to `trpc.timers.upsert`. On `CONFLICT`, server wins: fetches the server record and overwrites Dexie.
2. **Reconcile** — calls `trpc.timers.reconcile` with `since` (last sync timestamp) and local `{serverId, updatedAt}` pairs to pull stale/missing records down.

Timers carry `syncStatus: 'pending' | 'synced'`, `serverId`, and `version` in the Dexie schema (`src/db/schema.ts`). Guest users skip sync entirely.

### Auth flow

1. Frontend redirects to Cognito hosted UI (`useAuth.login()`)
2. Cognito redirects back to `/auth/callback` in the frontend with `?code=`
3. Frontend POSTs `{ code, origin }` to `api.evinle.app/auth/callback` (auth Lambda)
4. Auth Lambda exchanges the code with Cognito and sets an `httpOnly` `refresh_token` cookie
5. Frontend stores the returned `idToken` in memory (`src/lib/trpc.ts:idToken`)
6. tRPC calls attach `Authorization: Bearer <idToken>`; on 401 the client auto-refreshes via `/auth/refresh` — concurrent refreshes share one in-flight promise to avoid Cognito rotation races

Cookie domain: `SameSite=Lax`, `Domain=evinle.app` in prod (omitted for localhost — see `server/auth/routes.ts`).

### Server

Fastify on AWS Lambda via `@fastify/aws-lambda`. Two separate Lambda functions:

| Lambda | Entry | Handles |
|--------|-------|---------|
| `AuthLambda` | `server/auth/index.ts` | `/auth/*` — Cognito OAuth, cookie management |
| `ApiLambda` | `server/api/index.ts` | `/trpc/*` — tRPC procedures, DB access |

API Gateway HTTP API routes `/auth/{proxy+}` without a JWT authorizer and `/trpc/{proxy+}` with a Cognito JWT authorizer. An explicit `OPTIONS /trpc/{proxy+}` route without an authorizer bypasses the JWT check for CORS preflights (API Gateway runs the authorizer before its own CORS handling).

**tRPC context** (`server/api/context.ts`): verifies the Bearer token with `aws-jwt-verify`, exposes `{ userId, db }`. `protectedProcedure` throws `UNAUTHORIZED` if `userId` is null.

**Database**: Drizzle ORM + PostgreSQL (RDS `t4g.micro`, publicly accessible with SSL enforced). Schema in `server/db/schema.ts`; migrations in `server/db/migrations/`. `server/drizzle.config.ts` points drizzle-kit at the DB.

### Infrastructure (CDK)

Two stacks in deployment order:

1. **`StorageStack`** (`infra/lib/storage-stack.ts`) — VPC, RDS instance, Cognito User Pool + App Client (Google IdP), secrets
2. **`AppStack`** (`infra/lib/app-stack.ts`) — Auth Lambda, API Lambda, API Gateway HTTP API, ACM cert + custom domain `api.evinle.app`, API mapping

`api.evinle.app` Cloudflare DNS must be **proxy-off** (grey cloud) — API Gateway terminates TLS directly.

### Frontend deployment

Frontend is deployed to **Cloudflare Workers** (static assets) via `wrangler`. `wrangler.jsonc` sets `not_found_handling: "single-page-application"` for client-side routing. Build env vars (`VITE_API_URL`, `VITE_COGNITO_DOMAIN`, `VITE_COGNITO_CLIENT_ID`) are baked in at build time.

### Key files

| Path | Role |
|------|------|
| `src/db/schema.ts` | `Timer` type, `TimerStatus`/`Priority`/`SyncStatus` — includes versioned migration interfaces `TimerV1`–`TimerV3` |
| `src/hooks/useTimers.ts` | CRUD helpers and `useActiveTimers` live query |
| `src/store/timerStore.ts` | Zustand — in-memory timer mirror, `setTimeout` scheduling, `firedTimer` surface |
| `src/hooks/useAuth.ts` | Auth state machine, Cognito redirect, token refresh |
| `src/hooks/useSyncEngine.ts` | Dexie ↔ server sync (drain pending + reconcile) |
| `src/lib/trpc.ts` | tRPC client with auth header injection and 401 auto-refresh |
| `src/lib/api.ts` | `fetchFromBackend` — raw fetch helper for auth endpoints |
| `server/auth/routes.ts` | `/auth/callback`, `/auth/refresh`, `/auth/logout` |
| `server/api/routers/timers.ts` | tRPC `timers.*` procedures |
| `server/api/context.ts` | JWT verification + DB singleton per Lambda instance |
| `server/env.ts` | Zod env schemas; `getAuthEnv()` / `getApiEnv()` singletons |
| `infra/lib/storage-stack.ts` | RDS + Cognito resources |
| `infra/lib/app-stack.ts` | API Gateway + Lambda resources |

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
