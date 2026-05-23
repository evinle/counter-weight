# Milestone 2: Backend + Auth + Cloud Sync — Plan Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cloud backend with Cognito auth, PostgreSQL storage via RDS, and a bidirectional offline-first sync layer to the existing PWA.

**Architecture:** Auth Lambda (outside VPC) handles token exchange via Cognito's Hosted UI; API Lambda (inside VPC) exposes a tRPC/Fastify router backed by Drizzle + RDS (direct connection, no proxy). Frontend stays fully functional offline; sync happens in a tiered background engine. JWT verification uses `aws-jwt-verify`'s caching JWKS fetcher, re-fetching via a Cognito VPC Interface Endpoint on key rotation — no NAT required.

**Tech Stack:** CDK v2, Drizzle ORM, Zod, tRPC v11, Fastify v5, `@fastify/aws-lambda`, `aws-jwt-verify`, TanStack Query v5, `@trpc/client`, `@trpc/react-query`

---

## Task/Phase Tags

- **[EXTERNAL]** — human action required in AWS Console, Google Cloud Console, Apple Developer Portal, or terminal with AWS credentials. No code produced.
- **[CODEBASE]** — produces commits. Can be done by an agent or developer with only this repo.

External tasks are in Phase 0 (prerequisites) and Phase 6 (first deploy). Everything else is codebase work.

---

## File Map

### New directories
```
infra/                  CDK project (StorageStack + AppStack)
server/                 Lambda source (auth + api) + Drizzle
```

### New files
```
infra/package.json
infra/tsconfig.json
infra/cdk.json
infra/bin/app.ts
infra/lib/storage-stack.ts
infra/lib/app-stack.ts

server/package.json
server/tsconfig.json
server/drizzle.config.ts
server/db/schema.ts
server/db/index.ts
server/auth/index.ts
server/auth/routes.ts
server/auth/routes.test.ts
server/api/index.ts
server/api/context.ts
server/api/router.ts
server/api/routers/auth.ts
server/api/routers/auth.test.ts
server/api/routers/timers.ts
server/api/routers/timers.test.ts

src/lib/trpc.ts
src/hooks/useAuth.ts
src/components/LoginView.tsx
src/test/useAuth.test.ts
src/test/useSyncEngine.test.ts
src/test/db.migration.test.ts
```

### Modified files
```
src/db/schema.ts          add M2 fields + SYNC_STATUSES
src/db/index.ts           version 3 migration
src/hooks/useTimers.ts    tiered sync mutations
src/hooks/useSyncEngine.ts (new hook, listed above)
src/App.tsx               QueryClientProvider + auth gate + SyncEngineMount
package.json              add @tanstack/react-query, @trpc/client, @trpc/react-query, zod
```

---

## Phase Table

| Phase | Tag | Description | Depends on |
|-------|-----|-------------|-----------|
| [Phase 0: External Prerequisites](phase-0-prerequisites.md) | EXTERNAL | AWS CLI, CDK bootstrap, Google OAuth client | — |
| [Phase 1: Repository & Package Setup](phase-1-setup.md) | CODEBASE | Init infra/ and server/ packages, add frontend deps | — |
| [Phase 2: CDK Infrastructure](phase-2-cdk.md) | CODEBASE | StorageStack (VPC, RDS, Cognito) + AppStack (Lambdas, API GW) | Phase 1 |
| [Phase 3: Server Database](phase-3-database.md) | CODEBASE | Drizzle schema, client factory, initial migration | Phase 1 |
| [Phase 4: Auth Lambda](phase-4-auth-lambda.md) | CODEBASE | Auth routes (TDD), Lambda handler | Phase 1, 2 env context |
| [Phase 5: API Lambda](phase-5-api-lambda.md) | CODEBASE | tRPC context, router, auth.bootstrap, timers CRUD, API handler | Phase 3, 4 |
| [Phase 5.1: Remove RDS Proxy](phase-5.1-remove-rds-proxy.md) | CODEBASE | Remove DatabaseProxy, connect Lambda directly to RDS | Phase 5 |
| [Phase 6: First Deploy](phase-6-deploy.md) | EXTERNAL + CODEBASE | Deploy StorageStack, configure federation, run migrations, deploy AppStack | Phase 0, 2, 5.1 |
| [Phase 7: Frontend Dexie Migration](phase-7-dexie-migration.md) | CODEBASE | Add M2 fields to Dexie schema (TDD), v3 upgrade migration | Phase 3 schema ref |
| [Phase 8: Frontend Auth](phase-8-frontend-auth.md) | CODEBASE | tRPC client, useAuth hook (TDD), LoginView, App.tsx auth gate | Phase 5, 7 |
| [Phase 9: Frontend Sync Engine](phase-9-sync-engine.md) | CODEBASE | useSyncEngine (TDD), tiered mutations in useTimers, wire in App.tsx | Phase 5, 7, 8 |

---

## Spec Coverage Check

| Spec requirement | Task |
|---|---|
| VPC, private subnets, no NAT | 2.1 StorageStack |
| RDS db.t4g.micro (direct connection) | 2.1 StorageStack + 5.1 |
| Cognito User Pool + Hosted UI | 2.1 StorageStack |
| Cognito VPC Interface Endpoint | 2.1 StorageStack |
| Auth Lambda (callback/refresh/logout) | 4.1–4.2 |
| API Lambda (tRPC, inside VPC) | 5.1–5.5 |
| JWKS caching fetcher (key rotation safe) | 5.1 context.ts |
| Deploy order runbook | 6.3–6.4 |
| Google + Apple federation | 6.2 EXTERNAL |
| Drizzle schema (users, timers, timer_events) | 3.1 |
| Optimistic concurrency via version | 5.4 timers.upsert/complete/cancel |
| 409 conflict: server wins, CloudWatch log | 9.1 useSyncEngine |
| Dexie v3 migration (serverId, userId, syncStatus, version) | 7.1 |
| lastSyncedAt in localStorage, bounds reconcile | 9.1 useSyncEngine |
| Auth timeout (3s, fallback unauthenticated) | 8.2 useAuth |
| Silent refresh on mount | 8.2 useAuth |
| idToken in-memory only | 8.1 trpc.ts + 8.2 useAuth |
| httpOnly cookie for refresh token | 4.1 routes.ts |
| auth.bootstrap upsert | 5.3 |
| timers.list (non-cancelled) | 5.4 |
| timers.upsert (create + update) | 5.4 |
| timers.complete / timers.cancel | 5.4 |
| timers.reconcile with since param | 5.4 |
| Tiered sync (critical concurrent, deferred pending) | 9.2 |
| Drain pending on mount + online event | 9.1 |
| Pull on reconnect + visibilitychange | 9.1 |
| LoginView (Google + Apple buttons) | 8.3 |
| QueryClientProvider wrapper | 8.4 |
| auth gate (loading spinner / login / app) | 8.4 |
