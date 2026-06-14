# Frontend Context

## Glossary

### Unclaimed Timer
A timer with `userId: null` in Dexie — created while the user was a guest (or before any account existed on the device). Unclaimed timers have `syncStatus: 'synced'` and are never picked up by the sync engine, which filters by `userId === user.userId`. When a user logs in and unclaimed timers exist, they are offered three choices: sync them to the account, keep them local (leave `userId: null`), or remove them.

### Notification Scheduled
A server-side boolean (`notification_scheduled`) on a timer indicating whether the scheduling infrastructure (currently EventBridge) has confirmed a push notification schedule. Exposed to the client as `notificationScheduled: boolean`. The client has no knowledge of what scheduling infrastructure sits behind this flag.

### Retry At
A timestamp returned by the server alongside `notificationScheduled` when a timer's push schedule has not been confirmed. `retryAt: null` means no retry is possible — the server permanently gives up once `now >= targetDatetime`. A past/present timestamp means retry immediately. A future timestamp means wait until then. The client calls `timers.retrySchedule` when `!notificationScheduled && retryAt !== null`.

### Smart Group
A user-created saved filter. Stores a `GroupConditions` JSON tree (Tier 2: AND-only) that the filter evaluator (`@cw/filters`) applies at runtime against local timer data. Membership is computed — no `groupId` FK on timers. Synced across devices via the generic sync adapter.

### View (Group By)
A client-only display mode that re-renders the timer feed as labeled sections grouped by a chosen property (priority, tag, time bucket, status). No backend — stored in localStorage as `cw:groupBy`. Within each section, the global Smart sort applies.

### View Store
A Zustand store (`viewStore`) holding the current feed display configuration: active Smart Group selection (`selectedGroupId: number | null`), sort mode (M4.8), and group-by mode. Single source of truth for all view settings — readable by the feed, history, and analytics views.

### Smart Sort
The default global sort mode. Computes an urgency score per timer: `priorityWeight + timeScore`, where overdue timers score very high and time-to-fire inversely scales the time component. A critical timer due in two weeks can score below a low-priority timer due in five minutes.

### Sync Adapter
A typed interface that wraps a single synced entity (timers, tags, groups) and plugs into the generic drain/reconcile loop in `useSyncEngine`. Each adapter provides `getPending`, `drain`, `getServerRecords`, `mapToLocal`, and conflict resolution hooks. Server wins on CONFLICT for all adapters.
