# Milestone 2: Backend + Auth + Cloud Sync — Design Spec
_2026-05-13_

## Goal

Add a cloud backend to the existing local-first PWA. Timers created offline sync to the server when connectivity is restored. Auth is handled via Cognito with Google and Apple as federated identity providers. The app remains fully functional with no internet connection.

---

## Scope

- AWS infrastructure (CDK): VPC, RDS PostgreSQL, Cognito, two Lambda functions, API Gateway
- tRPC API (Fastify + Drizzle) with timer CRUD and sync procedures
- Cognito auth with httpOnly cookie refresh token pattern
- Frontend sync layer: tiered mutations, pull-on-reconnect, on-open reconciliation
- Dexie schema additions for sync state

**Out of scope for M2:** EventBridge scheduling, push notifications (M3), groups/tags/filtering (M4), CloudFront/S3 hosting (M5), Lambda Durable Functions (reassess at M3).

---

## Stack Additions

| Layer | Addition | Rationale |
|---|---|---|
| ORM | Drizzle ORM | Lightweight, Lambda-friendly, schema = TypeScript types |
| Validation | Zod | Shared schemas across tRPC router, Drizzle, and frontend forms |
| Server sync | TanStack Query | Manages cloud mutations, retry/backoff, pull reconciliation |
| Auth SDK | plain `fetch` | Cognito Hosted UI redirect + token exchange; no Amplify library needed |
| JWT verification | `aws-jwt-verify` | Caching JWKS fetcher; verifies offline, re-fetches via Cognito VPC endpoint on key rotation |
| Infrastructure | AWS CDK (TypeScript) | TypeScript-native, two stacks |

---

## Architecture

```
counter-weight.app/           → S3 (React PWA) [M5 — path reserved now]
counter-weight.app/auth/*     → Auth Lambda (outside VPC)
counter-weight.app/trpc/*     → API Lambda (inside VPC)

Auth Lambda (no VPC, internet access)
  POST /auth/callback          exchange code → tokens, set httpOnly cookie
  POST /auth/refresh           read cookie → Cognito token endpoint → new idToken
  POST /auth/logout            clear cookie

API Lambda (VPC, private subnet, no NAT)
  ALL /trpc/*                  Fastify + tRPC router + Drizzle → RDS

RDS PostgreSQL db.t4g.micro   private subnet, no public access
Cognito User Pool              Google + Apple federation, Hosted UI
```

**No NAT Gateway.** API Lambda needs no internet:
- DB credentials injected as env var at CDK deploy time (CDK reads from Secrets Manager, passes as `DATABASE_URL`)
- JWT verification uses `aws-jwt-verify`'s caching JWKS fetcher. On cold start it verifies offline using the cached key set; on verification failure (key rotation) it re-fetches from Cognito's JWKS endpoint via a **Cognito VPC Interface Endpoint (PrivateLink)** in the private subnet. No NAT required; endpoint cost ~$0.01/hr/AZ.

Auth Lambda needs internet to call Cognito's `/oauth2/token` endpoint — it is outside the VPC so internet access is available by default.

---

## CDK Stacks

### StorageStack (long-lived, rarely redeployed)

- VPC: 2 AZs, private subnets only (no NAT Gateway)
- RDS: `db.t4g.micro` PostgreSQL, private subnet, no public access, SSL enforced
- RDS Proxy: sits between API Lambda and RDS, pools connections — prevents connection exhaustion under Lambda concurrency (~$0.015/hr)
- Secrets Manager: RDS connection string
- Cognito User Pool: Google + Apple identity providers, Hosted UI domain, app client (auth code flow + PKCE)
- Cognito VPC Interface Endpoint: allows API Lambda to re-fetch JWKS on key rotation without NAT

### AppStack (redeployed on code changes, depends on StorageStack)

- Auth Lambda: outside VPC, `DATABASE_URL` not needed, Cognito client ID/secret from env
- API Lambda: inside VPC, `DATABASE_URL` from Secrets Manager (injected at deploy); connects to RDS via RDS Proxy endpoint
- API Gateway HTTP API:
  - `ANY /auth/{proxy+}` → Auth Lambda
  - `ANY /trpc/{proxy+}` → API Lambda
- IAM: Lambda execution roles with least-privilege policies

---

## Data Model

### Dexie additions (M2, version 3 migration)

Four new fields on the existing `Timer` interface:

| Field | Type | Notes |
|---|---|---|
| serverId | `string \| null` | UUID assigned by server after first sync |
| userId | `string \| null` | Cognito sub; null until logged in |
| syncStatus | `'pending' \| 'synced' \| 'conflict'` | Tracks whether local changes have reached server |
| lastSyncedAt | `Date \| null` | Timestamp of last successful sync; used to bound `timers.reconcile` calls |

Migration sets `syncStatus: 'synced'`, `serverId: null`, `userId: null`, `lastSyncedAt: null` on all existing records.

### Server schema (Drizzle, M2 subset)

**`users`**
| Column | Type | Notes |
|---|---|---|
| id | text PK | Cognito sub |
| email | text | |
| settings | jsonb | |
| created_at | timestamptz | |

**`timers`**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | server-generated |
| user_id | text FK → users | |
| group_id | uuid | nullable, no FK until M4 |
| title | text | |
| description | text | nullable |
| emoji | text | nullable |
| target_datetime | timestamptz | |
| original_target_datetime | timestamptz | NOT NULL — set on create, never updated |
| status | enum | active, fired, completed, missed, cancelled |
| priority | enum | low, medium, high, critical |
| is_flagged | boolean | |
| recurrence_rule | jsonb | nullable |
| eventbridge_schedule_id | text | nullable — M3 populates this |
| version | integer | optimistic concurrency counter, starts at 1 |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**`timer_events`**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| timer_id | uuid FK → timers | |
| user_id | text FK → users | |
| event_type | enum | created, updated, rescheduled, completed, cancelled |
| occurred_at | timestamptz | |
| metadata | jsonb | e.g. `{ previous_target, next_target }` |

**Conflict resolution:** client sends `version` with every update. If server's `version` differs → 409 Conflict. Client pulls server record, overwrites Dexie, marks `syncStatus: 'synced'`. Server always wins. This is a deliberate product decision — the losing device's change is silently discarded. Conflicts are logged to CloudWatch (timer ID, user ID, local version, server version) for observability.

---

## Auth Flow

### End-to-end

```
1. User taps "Sign in with Google/Apple"
2. App redirects to Cognito Hosted UI
3. Cognito redirects to Google/Apple → user authenticates
4. Cognito redirects to app callback URL with auth code
5. App POST /auth/callback { code }
   Auth Lambda → Cognito /oauth2/token
   Response: Set-Cookie: refresh_token (httpOnly, Secure, SameSite=Strict, Path=/auth)
             Body: { idToken, expiresIn }
6. App stores idToken in memory only
7. Every tRPC request: Authorization: Bearer <idToken>
8. API Lambda context.ts: verifies JWT offline via bundled JWKS, extracts sub → userId
9. On idToken expiry: app POST /auth/refresh → new idToken returned, refresh_token cookie rotated
10. On app load: POST /auth/refresh silently — if cookie present, user is auto-logged in
```

### `auth.bootstrap` tRPC procedure

Called once after login. Upserts the `users` row (id = Cognito sub, email from token claims). Idempotent — safe to call on every login.

### Token storage

| Token | Storage | Rationale |
|---|---|---|
| idToken | In-memory only | Short-lived (~1 hour); XSS-safe; lost on page reload → restored via silent refresh |
| refresh_token | httpOnly cookie | Never accessible to JavaScript; rotated by Cognito on each use |

### Same-domain requirement

Both `/auth/*` and `/trpc/*` route through the same API Gateway, so cookies are same-origin. CloudFront path routing (M5) will maintain this by routing both prefixes through the same domain.

---

## tRPC Procedures

All procedures except `auth.bootstrap` require a valid JWT (`ctx.userId` is set by `context.ts`).

| Procedure | Description |
|---|---|
| `auth.bootstrap` | Upsert user row on first login |
| `timers.list` | Return all non-cancelled timers for `userId` |
| `timers.upsert` | Create or update; `serverId: null` = new record, UUID = existing. Returns `{ serverId, version }` |
| `timers.complete` | Set `status = completed`, write `timer_events(completed)` |
| `timers.cancel` | Set `status = cancelled`, write `timer_events(cancelled)` |
| `timers.reconcile` | Client sends `{ since: lastSyncedAt, records: [{ serverId, updatedAt }] }`; server returns records modified after `since` that it considers stale or missing relative to the client snapshot |

`eventbridge_schedule_id` is not populated in M2 — `timers.upsert` leaves it null. M3 adds schedule creation to this procedure without a schema migration.

---

## Frontend Sync Changes

### What stays unchanged

All display components (`FeedView`, `TimerCard`, `ToastNotification`, `CreateEditView`), `useAnimatedCountdown`, `useActiveTimers`, Zustand timer store, all countdown logic.

### What changes

**`src/db/schema.ts`** — M2 fields added to `Timer` interface, `SYNC_STATUSES` const array.

**`src/db/index.ts`** — version 3 migration.

**`src/hooks/useTimers.ts`** — CRUD functions gain concurrent server sync for critical operations. Non-critical mutations (title rename, emoji, flag, priority) write to Dexie and mark `syncStatus: 'pending'`; sync is deferred to `useSyncEngine`.

**`src/App.tsx`** — `QueryClientProvider` wrapper, auth gate (show `LoginView` when unauthenticated), `SyncEngineMount` component.

### New files

**`src/lib/trpc.ts`** — tRPC client + TanStack Query integration. Injects `Authorization: Bearer` header. On 401: calls `/auth/refresh`, retries once with new token.

**`src/hooks/useAuth.ts`** — auth state (`loading | unauthenticated | authenticated`), `idToken` in memory, `userId` from token claims. `login()` redirects to Cognito. On mount: silent refresh attempt with a 3s timeout — on timeout or network failure, falls back to `unauthenticated` rather than hanging. While `loading`, app renders a minimal spinner; it never blocks on auth indefinitely.

**`src/hooks/useSyncEngine.ts`** — three responsibilities:
1. **Drain pending queue** — on mount and on `online` event: push all `syncStatus: 'pending'` records via `timers.upsert`. On success: set `syncStatus: 'synced'`, store `serverId`. On 409: overwrite Dexie with server version.
2. **Pull on reconnect + focus** — on `online` + `visibilitychange` to visible: call `timers.list`, merge into Dexie (server wins on `updatedAt` conflict; server-only records inserted as new).
3. **On-open reconciliation** — on app open while online: call `timers.reconcile` with `since: lastSyncedAt`, update stale Dexie records, update `lastSyncedAt` on success.

**`src/components/LoginView.tsx`** — "Sign in with Google" and "Sign in with Apple" buttons; calls `login()`.

### Tiered sync summary

| Mutation | Sync timing |
|---|---|
| create, reschedule, complete, cancel | Dexie write + concurrent server mutation (TanStack Query) |
| rename, emoji, flag, priority | Dexie write (`pending`) + deferred via `useSyncEngine` |
| Pull | On app open, `online` event, `visibilitychange` to visible |

### Offline behaviour

| Scenario | Behaviour |
|---|---|
| Create timer, no internet | Instant Dexie write, `syncStatus: 'pending'`, retries on reconnect |
| Open app on second device | Silent refresh → auto-login → pull → Dexie populated |
| Conflict (two devices offline) | First write to server wins; loser pulls server version on 409 |
| App closed, timer fires | No push yet (M3); in-app toast fires if app is open |

---

## Manual Setup (what code cannot do)

| Task | Where |
|---|---|
| `aws configure` (CLI credentials) | Terminal |
| `cdk bootstrap` (one-time per account/region) | Terminal |
| Create Google OAuth 2.0 client ID | Google Cloud Console |
| Add Cognito callback URL to Google app | Google Cloud Console |
| Store Google client secret in Secrets Manager | AWS Console or CLI |
| Create Apple Services ID + Sign in with Apple | Apple Developer Console ($99/yr) |
| Store Apple private key in Secrets Manager | AWS Console or CLI |
| `npx drizzle-kit migrate` on each deploy | Terminal (until CI/CD in M5) |
| Stop RDS when not developing | AWS Console or CLI |

**Deploy order (must follow on every release):**
1. `npx drizzle-kit migrate` — run migrations against the live DB first
2. `cdk deploy AppStack` — deploy updated Lambda code

Deploying AppStack before migrating will cause Lambda cold-start failures if the new code references schema that doesn't exist yet. There is no automated rollback — if a migration must be reverted, write a down-migration manually.

---

## AWS Learning Opportunities

| Service | What you learn |
|---|---|
| **CDK** | Infrastructure as TypeScript, constructs, stacks, cross-stack references, `cdk diff` / `cdk deploy` |
| **VPC** | Public vs private subnets, security groups, how services communicate without internet |
| **RDS** | Subnet groups, managed vs self-hosted DB, SSL enforcement, stop/start for cost |
| **Secrets Manager** | Storing credentials, referencing in CDK, injecting into Lambda env at deploy time |
| **Cognito** | User Pools, OAuth 2.0 authorization code flow, PKCE, identity federation, JWT structure |
| **Lambda** | VPC vs non-VPC configuration, execution roles, cold starts, environment variables |
| **API Gateway** | HTTP API, multi-route configuration, Lambda proxy integration, CORS |
| **IAM** | Least-privilege execution roles, what each permission grants |
| **JWT / JWKS** | Token structure (header/payload/sig), offline verification, key rotation |
| **httpOnly cookies** | Secure token storage, SameSite/Secure flags, refresh token rotation |
