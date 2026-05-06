# Counter Weight — Design Spec
_2026-05-06_

## Vision

A set-and-forget countdown app that treats time as data. Every event in your life — deadlines, habits, recurring tasks — is represented as a simultaneous countdown. The interface surfaces all countdowns at once, letting you group, sort, filter, prioritise, and flag them. Notifications fire when timers end. Completion and miss history feeds a statistics layer, with a path to external analytics platforms.

---

## Platforms & Constraints

- **Browser PWA**, mobile-first, desktop usable
- **SSO login** via OAuth (Google, Apple) through Amazon Cognito
- Push notifications are **critical** — must arrive when the app is not open
- iOS requires the PWA to be installed to the Home Screen to receive push notifications; this is an acceptable user-facing constraint
- All timers are **countdowns** — the `target_datetime` is the stored fact, the countdown is computed as `target - now` on the client. Scheduled and recurring timers follow the same model.
- Precision: **to the second**
- Rescheduling (delay or speed up) is a first-class operation

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend framework | React + Vite + TypeScript | Ecosystem, TypeScript-native |
| PWA | vite-plugin-pwa | Service worker, Web App Manifest |
| Styling | Tailwind CSS | Mobile-first responsive |
| Local database | Dexie.js (IndexedDB) | Lightweight, reactive (`useLiveQuery`), works in service worker |
| Server sync | TanStack Query | Background sync, optimistic updates, retry/backoff |
| API layer | tRPC | End-to-end type safety without codegen |
| Backend runtime | Node.js + Fastify | TypeScript-native, first-class Lambda support |
| ORM | Drizzle ORM | Lightweight, Lambda-friendly, schema = TypeScript types |
| Validation | Zod | Shared schemas between tRPC router, Drizzle, and frontend forms |
| Auth | Amazon Cognito | User Pools + OAuth federation, JWT sessions |
| Database | Amazon RDS PostgreSQL | Managed, partitioning support |
| Timer scheduling | Amazon EventBridge Scheduler | One-time schedules at exact `target_datetime`, reschedule via update |
| Push notifications | Web Push (VAPID) | Standard, no Firebase/third-party dependency |
| Frontend hosting | S3 + CloudFront | CDN, HTTPS termination |
| Infrastructure | AWS CDK (TypeScript) | TypeScript-native, constructs map to AWS services, best for learning AWS |
| Testing | Vitest, Playwright, LocalStack | See Testing section |

---

## Architecture

Two Lambda functions with distinct responsibilities:

```
CloudFront → S3 (React PWA)
CloudFront → API Gateway → Lambda: API (tRPC + Fastify + Drizzle)
                                      ↕ RDS PostgreSQL
                                      ↕ Cognito (JWT verification)
                                      ↕ EventBridge Scheduler (create/update/delete schedules)

EventBridge Scheduler → Lambda: Notify
                                  → reads timer + push subscriptions from RDS
                                  → fans out Web Push to all user devices
                                  → updates timer status + writes timer_events
                                  → reschedules EventBridge if recurring
```

**API Lambda** — handles all user-facing tRPC calls: CRUD on timers, groups, tags; auth; export.

**Notify Lambda** — invoked only by EventBridge Scheduler. Sends push notifications, writes events, handles recurrence. Never invoked by the client directly.

---

## Data Model

### users
| Column | Type | Notes |
|---|---|---|
| id | text PK | Cognito sub |
| email | text | |
| settings | jsonb | notification preferences, display preferences |
| created_at | timestamptz | |

### timer_groups
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | text FK → users | |
| name | text | |
| color | text | |
| emoji | text | nullable |
| created_at | timestamptz | |

### timers
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | text FK → users | |
| group_id | uuid FK → timer_groups | nullable — a timer belongs to at most one group |
| title | text | |
| description | text | nullable |
| emoji | text | nullable |
| target_datetime | timestamptz | the only stored time value; countdown = target - now |
| status | enum | active, fired, completed, missed, cancelled |
| priority | enum | low, medium, high, critical |
| is_flagged | boolean | |
| recurrence_rule | jsonb | nullable — `{ cron: "0 9 * * 1", tz: "Europe/London" }` |
| eventbridge_schedule_id | text | nullable — `"timer-{uuid}"`, deterministic for update/delete |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### timer_events
Append-only. Never updated. Partitioned by `occurred_at` (monthly range partitions).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| timer_id | uuid FK → timers | |
| user_id | text FK → users | |
| event_type | enum | created, updated, fired, completed, missed, snoozed, rescheduled, cancelled |
| occurred_at | timestamptz | partition key |
| metadata | jsonb | e.g. `{ previous_target, next_target, snooze_duration }` |

### tags
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | text FK → users | |
| name | text | |
| color | text | |
| created_at | timestamptz | |

### timer_tags / timer_group_tags
Join tables. Composite primary keys `(timer_id, tag_id)` and `(group_id, tag_id)`.

### push_subscriptions
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | text FK → users | |
| endpoint | text | browser push relay URL |
| p256dh | text | encryption key |
| auth | text | auth secret |
| device_hint | text | e.g. "iPhone Safari", "Chrome Desktop" |
| created_at | timestamptz | |
| last_used_at | timestamptz | |

### Key indexes
```sql
CREATE INDEX ON timers (user_id, status, target_datetime);
CREATE INDEX ON timers (target_datetime) WHERE status = 'active';
CREATE INDEX ON timer_events (user_id, occurred_at);
CREATE INDEX ON timer_events (timer_id);
CREATE INDEX ON push_subscriptions (user_id);
```

---

## Timer Lifecycle

**Create**
Client → tRPC `timers.create` → API Lambda writes timer row + `timer_events (created)` → creates EventBridge schedule at `target_datetime`.

**Reschedule**
Client → tRPC `timers.reschedule` → API Lambda updates `target_datetime` + writes `timer_events (rescheduled, metadata: { previous_target })` → updates EventBridge schedule (deterministic name, no lookup needed).

**Fire**
EventBridge → Notify Lambda → re-reads timer (guard: exit if no longer active) → fans out Web Push via `Promise.allSettled` (410 Gone responses delete stale subscriptions) → writes `timer_events (fired)` → if recurring: calculates next `target_datetime` from `recurrence_rule`, updates timer, creates new EventBridge schedule, writes `timer_events (rescheduled)`.

**Complete**
Client → tRPC `timers.complete` → API Lambda updates `status = completed` + writes `timer_events (completed)` → deletes EventBridge schedule (cancels any pending fire).

**Missed**
Derived state, not a real-time event. When a client fetches a timer (or the feed), the API computes missed status on read: `status = fired` with no subsequent `completed` event within 24 hours (default, user-configurable per timer). API writes `timer_events (missed)` at that point and updates `status = missed`. No background Lambda needed.

---

## Local-First & Notification Strategy

The client and server have distinct roles:

**Client (Dexie.js + TanStack Query)**
- Dexie.js is the primary read source — all timer display reads from IndexedDB, no network
- Writes hit IndexedDB immediately (instant UI), then sync to server in background via TanStack Query
- Offline writes are queued and replayed via Background Sync API when connectivity returns
- A global `TimerManager` (singleton) reads active timers from Dexie.js on app load, maintains a single `setTimeout` chain targeting the nearest `target_datetime`, and fires in-app notifications (toast/alert) when a timer ends

**Server (EventBridge + Notify Lambda)**
- Handles notifications when the app is closed and the service worker has been killed
- Server push wakes the service worker, which displays an OS-level notification
- The server always sends push on timer fire — no attempt to detect whether the service worker is alive (not reliably knowable). Deduplication handled by the service worker: on receiving a push, the SW checks Dexie.js for whether the timer's `status` is already `fired` or `completed` (set by the in-app TimerManager). If so, it suppresses the OS notification silently.

**Push relay**
Web Push is a W3C standard. The browser provides an endpoint URL pointing to its vendor's relay (Google for Chrome, Mozilla for Firefox, Apple for Safari). No Firebase account or Apple Developer account required — VAPID keys are sufficient for all three.

---

## Notifications: iOS Consideration

iOS only grants push permission to PWAs installed to the Home Screen (iOS 16.4+). The app detects iOS on first visit and prompts the user to install before offering to enable notifications. No programmatic workaround exists.

---

## Metrics & Export

**In-app metrics** — derived from `timer_events` queries: completion rate, missed rate, average delay before completion, breakdown by tag and group. Queries run against the RDS read replica once one is provisioned. No separate analytics store needed initially.

**User export** — on-demand. API Lambda queries `timer_events` for the requesting user and returns CSV/JSON directly in the response body. Lambda's 6MB synchronous response limit is sufficient for personal datasets. S3 is not required for this path.

**Databricks / Snowflake integration (future)**

Two paths, in order of complexity:

1. **S3 staging** — a scheduled Lambda or AWS Glue job writes `timer_events` to S3 as Parquet. Both Databricks (Auto Loader) and Snowflake (Snowpipe) ingest from S3 natively. This is the standard interchange format for both platforms.
2. **CDC live sync** — AWS DMS streams Postgres WAL changes to Kinesis, landing in Databricks Delta tables or Snowflake. This is the live sync path deferred for now; the append-only `timer_events` table and monthly partitioning are designed to make this straightforward to add.

Managed connectors (Fivetran, Airbyte) are also a viable zero-code path to either platform.

---

## Testing Strategy

| Layer | Tool | Scope |
|---|---|---|
| Business logic | Vitest | Timer scheduling, recurrence calculation, countdown math, grouping/sorting |
| API integration | Jest + Supertest | tRPC routes, Drizzle queries |
| AWS services | LocalStack | EventBridge, S3, Lambda integration tests |
| E2E | Playwright | Create timer → in-app notification → complete; push notification flow |
| CDK stacks | aws-cdk-lib/assertions | Infrastructure unit tests |

TDD rhythm applies to business logic and API layers. E2E covers critical user flows and the push notification path end-to-end against LocalStack.

---

## AWS Infrastructure

Two CDK stacks, separating storage lifetime from app deployment lifetime:

**StorageStack**
- RDS PostgreSQL instance (with read replica once needed)
- S3 buckets (PWA hosting, analytics staging)
- Cognito User Pool + app client

**AppStack** (depends on StorageStack)
- Lambda: API (Fastify + tRPC)
- Lambda: Notify (EventBridge target)
- API Gateway HTTP API
- CloudFront distribution
- EventBridge Scheduler permissions

CI/CD via GitHub Actions: test → CDK synth → CDK deploy.

**Scaling considerations**
- `timer_events` partitioned monthly from day one — expensive to retrofit
- RDS read replica added when analytics queries impact write performance
- EventBridge Scheduler quota: 1M schedules per account per region. Mitigation at scale: polling Lambda replaces per-timer schedules, trading per-second precision for throughput
- Indexes defined at schema creation time (see Data Model section)

---

## Future Considerations

- Live sync to Databricks/Snowflake via CDC
- Sharing timers or groups between users
- Public timer embeds
- Native mobile apps (React Native) if PWA push limitations become a product constraint
