# Milestone 3: Push Notifications — Design Spec
_2026-05-29_

## Goal

Deliver OS-level push notifications when timers fire, even when the app is closed and the service worker has been killed. Background pushes are sent by a dedicated Notify Lambda invoked by EventBridge Scheduler at each timer's `target_datetime`.

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
| `upsert` — first insert (serverId null) | Create EventBridge schedule at `target_datetime` |
| `upsert` — update (serverId present) | `put-schedule` (handles reschedule idempotently) |
| `complete` | Delete EventBridge schedule |
| `cancel` | Delete EventBridge schedule |

EventBridge and the DB write are not atomic. AWS SDK retry (built-in, exponential backoff) covers transient failures. The `notificationScheduled` / `retryAt` mechanism (see §5) covers persistent failures.

### 3. Notify Lambda

A separate `NodejsFunction` CDK construct, distinct from the API Lambda, for two reasons:
- EventBridge invokes Lambda directly — it cannot call API Gateway
- The API Lambda is Fastify-shaped (API Gateway events); mixing EventBridge event handling into it would require forking before Fastify touches the event

Notify Lambda responsibilities on invocation:
1. Guard: exit if timer status is no longer `active` (timer may have been completed/cancelled since schedule was created)
2. Read push subscriptions for the timer's `userId`
3. Fan out `web-push.sendNotification()` via `Promise.allSettled` — `410 Gone` responses delete stale subscriptions
4. Write `timer_events { eventType: 'fired' }`

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

`retryAt: null` is returned when the timer has exhausted attempts and the server has decided to stop (e.g. max refill cycles exceeded — exact policy TBD).

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

---

## Open Questions

1. **Recurrence** — Notify Lambda recurrence handling (compute next `targetDatetime`, create new EventBridge schedule) deferred to M4. Timers with `recurrenceRule` fire once in M3.

2. **Missed status** — When does a `fired` timer become `missed`? The design spec says "API computes on read: status=fired with no completed event within 24h." Not yet implemented. Deferred — client feed only shows `active` and `fired`.

3. **iOS install prompt** — iOS requires PWA installed to Home Screen for push. App should detect iOS on first visit and prompt install before offering notifications. Not yet designed. Deferred.

4. **On-open EventBridge repair** — `timers.retrySchedule` covers client-triggered repair. A server-side sweep for timers where `notification_scheduled = false` (e.g. cron Lambda) is not in M3 scope.

5. **Notify Lambda `retryAt: null` policy** — Exact condition for permanently giving up (e.g. N refill cycles exceeded) not yet defined. TBD during M3 implementation.
