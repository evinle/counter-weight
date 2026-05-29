# Frontend Context

## Glossary

### Unclaimed Timer
A timer with `userId: null` in Dexie — created while the user was a guest (or before any account existed on the device). Unclaimed timers have `syncStatus: 'synced'` and are never picked up by the sync engine, which filters by `userId === user.userId`. When a user logs in and unclaimed timers exist, they are offered three choices: sync them to the account, keep them local (leave `userId: null`), or remove them.

### Notification Scheduled
A server-side boolean (`notification_scheduled`) on a timer indicating whether the scheduling infrastructure (currently EventBridge) has confirmed a push notification schedule. Exposed to the client as `notificationScheduled: boolean`. The client has no knowledge of what scheduling infrastructure sits behind this flag.

### Retry At
A timestamp returned by the server alongside `notificationScheduled` when a timer's push schedule has not been confirmed. `retryAt: null` means no retry is possible (max attempts exceeded or permanently failed). A past/present timestamp means retry immediately. A future timestamp means wait until then. The client calls `timers.retrySchedule` when `!notificationScheduled && retryAt !== null`.
