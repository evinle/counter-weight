# Server Context

## Glossary

### Calendar Connection
The registered relationship between a user and their Google Calendar that enables push notifications. Comprises the Google-side watch channel (registered via `events.watch()`) and the corresponding `google_calendar_connections` row in the DB. A user has at most one Calendar Connection at a time (`user_id` is the PK). When active, Google POSTs to the webhook on every calendar change. When absent or expired, no notifications are received.

**Lifecycle:** created on opt-in (upsert), renewed nightly while active, deleted on opt-out. Reconnecting after `reconnect_required` stops the old channel then upserts fresh credentials. On opt-out, imported timers (`source: 'google_calendar'`) are left intact with their `external_id` preserved — if the user reconnects, dedup on `external_id` updates existing timers rather than creating duplicates.

**Frontend surface:** `reconnect_required` is surfaced on the settings page only — a warning with a "Reconnect Google Calendar" CTA that restarts the OAuth flow.

**Status values:**
- `active` — healthy, Google is pushing
- `retrying` — last renewal attempt failed transiently; nightly Lambda will retry and increment `retry_count`
- `reconnect_required` — user must re-authorize; set immediately on `invalid_grant`, or after `retry_count` reaches the configured maximum on transient failures

### Calendar Event Import
The mapping from a Google Calendar event to a Timer on initial fetch and subsequent delta syncs. The webhook Lambda owns `title`, `targetDatetime`, and `status`; user-edited fields (`timerType`, `priority`) are left untouched on updates.

| Google field | Timer field | Notes |
|---|---|---|
| `id` | `external_id` | Dedup key; stable across updates and reconnects |
| `summary` | `title` | Direct map |
| `start.dateTime` | `targetDatetime` | For timed events |
| `start.date` + calendar `timeZone` | `targetDatetime` | For all-day events: midnight in the calendar's timezone |
| `status: 'cancelled'` | `status: 'cancelled'` | Soft-delete; timer stays in history |
| — | `source` | Always `'google_calendar'` |
| — | `timerType` | Defaults to `'reminder'`; user may change |
| — | `priority` | Defaults to `'medium'`; user may change |

### Sync Token
An opaque string returned by Google's `events.list()` API after each fetch, stored in `google_calendar_connections`. Passed on the next `events.list()` call to receive only events changed since the last fetch (delta sync). On first connect, a full `events.list()` seeds the timer data and stores the initial sync token. If a sync token is invalidated by Google (HTTP 410), a full re-fetch is required and a new token is stored.

### Schedule Kind
A discriminator on `SchedulePayload` (`kind: 'lead' | 'deadline'`) that tells the Notify Lambda which type of push notification to send. `'deadline'` means the timer's target time has arrived; `'lead'` means a heads-up is firing before the deadline. `kind` is optional in the payload for backward compatibility — absent `kind` defaults to `'deadline'`.

### Lead Notification
A push notification that fires at `targetDatetime - leadTimeMs`, before the timer's deadline. Sends `"Reminder: {title}"` copy. Does not write a `timer_event` row — only the deadline firing records `EventType.Fired`.

### Deadline Notification
A push notification that fires at `targetDatetime`. Sends `"{title}"` copy and writes `EventType.Fired`.

### Schedule Key
An opaque branded string (`ScheduleKey`) that identifies an EventBridge schedule. Constructed only via `timerScheduleKeys(serverId)`, which returns a `{ deadline: ScheduleKey, lead: ScheduleKey }` pair. Not interchangeable with `serverId`.

### Feedback Submission
A user-submitted record containing free text and up to 3 optional screenshots. Authenticated users only (Cognito JWT required). Rate-limited to 5 per user per 24-hour window. The submission is classified, spam-scored, and reformatted by a Bedrock agent (Haiku) in a single pass before being published as a GitHub Issue. Stored in the `feedback` table in Neon as the source of truth regardless of GitHub issue creation status.

**Agent output:** `{ type: 'bug' | 'feature' | 'general', severity: 'low' | 'medium' | 'high', spam_score: number (0–1), formatted_title: string, formatted_body: string }`. Submissions with `spam_score` above threshold are silently discarded — no DB row written.

### Feedback Image
A screenshot attached to a Feedback Submission. Maximum 3 per submission. Uploaded by the client directly to S3 via a presigned PUT URL (temporary staging only). After the spam check passes, the server downloads each image from S3, commits it to the `feedback-assets` orphan branch in the GitHub repo via the Contents API, and deletes the S3 object. The resulting `raw.githubusercontent.com` URL is permanent, GitHub-hosted, and embedded inline in the GitHub Issue body. A partial submission (some images failed to upload) is accepted — missing images are recorded in the DB but do not block issue creation.
