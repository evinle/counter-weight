# Milestone 3: Push Notifications — Design Spec
_2026-05-29_

## Goal

Deliver OS-level push notifications when timers fire, even when the app is closed and the service worker has been killed. Background pushes are sent by a dedicated Notify Lambda invoked by EventBridge Scheduler at `target_datetime - 1 minute`; the Lambda uses the AWS Durable Execution SDK to sleep until `target_datetime` before fanning out.

---

## Scope

- EventBridge Scheduler: per-timer schedules created/updated/deleted alongside timer mutations
- Notify Lambda: new CDK construct, invoked by EventBridge, fans out Web Push
- Push subscriptions: new `push_subscriptions` table, `pushSubscriptions.register` tRPC procedure
- VAPID key pair: generated once, stored in env vars / Secrets Manager
- Service worker: add `push` event handler with in-memory dedup
- Drain routing: drain dispatches to correct server procedure by timer status
- `event_type` enum: add `'fired'`
- Scheduling reliability: `notificationScheduled` + `retryAt` client contract, token bucket retry throttling

**Out of scope for M3:** Recurrence, missed status computation, iOS install prompt, on-open EventBridge repair procedure.

---

## Decisions

### 1. Drain routes by status

The sync drain (`useSyncEngine`) currently calls `upsert` for all pending timers regardless of status. In M3 the drain dispatches to the correct server procedure based on timer status:

| Status | Drain calls |
|---|---|
| `active`, `fired` | `timers.upsert` |
| `completed` | `timers.complete` |
| `cancelled` | `timers.cancel` |

This allows `complete` and `cancel` to delete the EventBridge schedule server-side. The offline-first architecture is unchanged — everything still writes to Dexie first with `syncStatus: 'pending'`.

### 2. EventBridge schedule lifecycle

EventBridge schedules use a deterministic name `timer-{serverId}` and `put-schedule` (idempotent create-or-update):

| Event | Server action |
|---|---|
| `upsert` — first insert (serverId null) | Create EventBridge schedule at `target_datetime - 1 minute` |
| `upsert` — update (serverId present) | `put-schedule` (handles reschedule idempotently) |
| `complete` | Delete EventBridge schedule |
| `cancel` | Delete EventBridge schedule |

EventBridge and the DB write are not atomic. AWS SDK retry (built-in, exponential backoff) covers transient failures. The `notificationScheduled` / `retryAt` mechanism (see §5) covers persistent failures.

### 3. Notify Lambda

A separate `NodejsFunction` CDK construct, distinct from the API Lambda, for two reasons:
- EventBridge invokes Lambda directly — it cannot call API Gateway
- The API Lambda is Fastify-shaped (API Gateway events); mixing EventBridge event handling into it would require forking before Fastify touches the event

The Notify Lambda uses the **AWS Durable Execution SDK**. EventBridge invokes it at `target_datetime - 1 minute`; the Lambda sleeps (zero compute charges during wait) until `target_datetime`, then performs its work. Configured timeout: **15 seconds** (covers the resume segment — guard + fan-out — not the sleep).

#### Background: AWS Lambda Durable Functions

Lambda Durable Functions (GA December 2025) extend standard Lambda with a **checkpoint/replay** execution model that enables fault-tolerant, long-running logic written as ordinary sequential code.

**How they work:**
- The AWS Durable Execution SDK wraps the Lambda handler and exposes a `DurableContext` with two primitive operation types:
  - **Steps** — wrap business logic calls; the SDK checkpoints the result and replays skip over completed steps on retry
  - **Waits** — suspend execution at a point in time or until a condition; compute charges stop during the suspension and resume when the function wakes
- On failure or interruption, the durable execution system re-invokes the Lambda from the beginning. The SDK replays code up to the last checkpoint, restoring prior results from stored state rather than re-executing them.
- Executions can run for up to one year; each individual Lambda invocation only covers one compute segment (time between checkpoints), so the configured Lambda timeout only needs to bound a single segment, not the full wall-clock duration.

**Why we use it here:**
- **Precision** — EventBridge Scheduler has up to ~1 minute of invocation jitter. Invoking the Lambda 1 minute early and sleeping until `target_datetime` guarantees the notification fires at the right moment regardless of that jitter.
- **Cost** — A plain Lambda sleeping 60 seconds would pay ~$0.000128 per invocation (128 MB × 60 s) just for idle time. Durable waits incur no duration charges; the only overhead is ~3 durable operations at $8/million ≈ $0.000024 per timer fired — roughly 5× cheaper for the sleep alone.
- **Fault tolerance** — If the Lambda is interrupted during fan-out, the checkpoint/replay mechanism ensures it resumes without re-sleeping or double-firing.

Notify Lambda responsibilities on invocation:
1. Wait until `target_datetime` (durable wait — no duration charges during sleep)
2. Guard: exit if timer status is no longer `active` (timer may have been completed/cancelled during the wait)
3. Read push subscriptions for the timer's `userId`
4. Fan out `web-push.sendNotification()` via `Promise.allSettled` — `410 Gone` responses delete stale subscriptions
5. Write `timer_events { eventType: 'fired' }`

`notification_scheduled` is set by the API Lambda's `upsert` when EventBridge `put-schedule` succeeds — not by the Notify Lambda. By the time the Notify Lambda fires, the schedule already existed and executed; the flag is irrelevant at that point.

### 4. Push subscriptions

New table in Postgres:

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | text FK → users | |
| endpoint | text UNIQUE | browser push relay URL — used for upsert and 410 cleanup |
| subscription | jsonb | `{ p256dh, auth, deviceHint }` — crypto keys from `PushSubscription.toJSON()`, `deviceHint` derived server-side from `User-Agent` at registration time |
| created_at | timestamptz | |
| last_used_at | timestamptz | |

New tRPC procedure: `pushSubscriptions.register` on the API Lambda. Client calls it when `Notification.permission` transitions to `'granted'` (idempotent upsert by endpoint). Also called on every app-open when permission is already `'granted'` — handles endpoint rotation.

### 5. VAPID keys

Generated once via `web-push generateVAPIDKeys()`. Not stored in the DB.

| Key | Where |
|---|---|
| `VAPID_PRIVATE_KEY` | Secrets Manager → Notify Lambda env |
| `VAPID_PUBLIC_KEY` | Notify Lambda env + `VITE_VAPID_PUBLIC_KEY` baked into frontend build |

The public key is passed to `pushManager.subscribe({ applicationServerKey: vapidPublicKey })` at subscription time. The relay stores it and rejects pushes not signed by the matching private key.

**Rotation:** VAPID keys are semi-permanent — treat rotation as a break-glass procedure (key compromise only). Rotating requires a frontend redeploy with a new `VITE_VAPID_PUBLIC_KEY`. Existing subscriptions become invalid (relay signature mismatch); they re-register on next app-open and stale entries clean up via `410 Gone`. No rotation automation in M3.

### 6. Scheduling reliability: client contract

The server exposes two fields on timer records returned from `reconcile`:

```ts
{
  notificationScheduled: boolean   // true = EventBridge schedule confirmed
  retryAt: string | null           // null = no retry info; timestamp = when client may retry
}
```

Client logic (only when `!notificationScheduled`):
- `retryAt === null` → nothing to do (max attempts exceeded or permanently failed)
- `retryAt` in the past or now → call `timers.retrySchedule({ serverId })` immediately
- `retryAt` in the future → `setTimeout` to trigger reconcile at that time, then retry

The client has no knowledge of EventBridge, retry counts, or token bucket parameters.

### 7. Token bucket (server-side retry throttling)

Per-timer token bucket. Parameters (constants in code, not DB):
- Capacity: `3` tokens
- Refill rate: `1 token / hour`

New DB columns on `timers`:

| Column | Type | Default |
|---|---|---|
| `notification_scheduled` | boolean | false |
| `schedule_retry_tokens` | float | 3.0 |
| `schedule_retry_last_refill_at` | timestamptz | null |

At reconcile time, server computes current tokens:
```
elapsed = now - scheduleRetryLastRefillAt
currentTokens = min(capacity, scheduleRetryTokens + elapsed * refillRate)
retryAt = currentTokens >= 1
  ? now                                          // retry available immediately
  : now + (1 - currentTokens) / refillRate       // time until next token
```

`retryAt: null` is returned when `now >= targetDatetime - 1 minute`. Once it is too late to schedule the Lambda in time for it to wake at `target_datetime`, scheduling is meaningless — the server stops retrying permanently.

New procedure: `timers.retrySchedule({ serverId })` — server recomputes tokens, rejects if insufficient, calls `put-schedule`, sets `notification_scheduled = true` on success.

### 8. Service worker push handler

The current SW handles `SYNC_TIMERS` messages with its own `setTimeout` map. M3 adds a `push` event handler.

Deduplication: in-memory `Set<string>` of `serverId` values for timers the SW has already fired via its own `setTimeout`. When a `push` event arrives:
1. Parse `serverId` from push payload
2. If `serverId` in the Set → suppress (SW already showed this notification in the same lifetime)
3. If visible client exists → suppress (app is foregrounded, in-app toast handles it)
4. Otherwise → `showNotification(title, { body, ... })`

When the SW's own `setTimeout` fires for a timer, it adds `serverId` to the Set before showing the notification.

Push payload shape (sent by Notify Lambda):
```json
{ "serverId": "uuid", "title": "Stand-up meeting", "emoji": "📅" }
```

Dexie is **not** imported into the SW — keeps the bundle lean and avoids schema coupling.

### 9. `event_type` enum migration

Add `'fired'` to the `event_type` Postgres enum. `'missed'` and `'snoozed'` deferred until they are actually written.

### 10. Recurrence (Notify Lambda)

When the Notify Lambda fires a timer with a non-null `recurrenceRule`, it uses the **clone-and-complete** model:

1. Update the current timer to `status: 'completed'`
2. Write `timer_events { eventType: 'completed' }` for the current timer
3. Compute the next `targetDatetime` from `recurrenceRule` (cron + tz)
4. Insert a new timer record with a fresh `id` (`serverId`), `status: 'active'`, the computed `targetDatetime`, and the same `recurrenceRule`
5. Write `timer_events { eventType: 'created' }` for the new record
6. Create an EventBridge schedule `timer-{newServerId}` at the new `targetDatetime`

The completed timer becomes a discrete history record. The client picks up both the completed record and the new active record on next reconcile.

---

## Open Questions

All original open questions resolved:

| Question | Resolution |
|---|---|
| Recurrence | Clone-and-complete — see §10 |
| Missed status | Removed from scope — concept not sufficiently defined |
| iOS install prompt | Moved to M4 scope |
| On-open server sweep | Removed from scope — client-triggered repair sufficient |
| `retryAt: null` policy | Give up when `now >= targetDatetime - 1 minute` — see §7 |
| Notify Lambda durability | Uses AWS Durable Execution SDK — EventBridge invokes 1 minute early, Lambda sleeps until `target_datetime`; see §3 |
| Notify Lambda guard placement | Post-wait only — cancellation/completion in the 1-minute window is unlikely enough not to warrant a pre-wait check; see §3 |
| EventBridge schedule time | `target_datetime - 1 minute` to guarantee Lambda is live before jitter window closes — see §2, §3 |
| Notify Lambda timeout | 15 seconds — covers resume segment (guard + fan-out) only, not the sleep; see §3 |
