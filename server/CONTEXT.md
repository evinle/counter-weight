# Server Context

## Glossary

### Schedule Kind
A discriminator on `SchedulePayload` (`kind: 'lead' | 'deadline'`) that tells the Notify Lambda which type of push notification to send. `'deadline'` means the timer's target time has arrived; `'lead'` means a heads-up is firing before the deadline. `kind` is optional in the payload for backward compatibility — absent `kind` defaults to `'deadline'`.

### Lead Notification
A push notification that fires at `targetDatetime - leadTimeMs`, before the timer's deadline. Sends `"Reminder: {title}"` copy. Does not write a `timer_event` row — only the deadline firing records `EventType.Fired`.

### Deadline Notification
A push notification that fires at `targetDatetime`. Sends `"{title}"` copy and writes `EventType.Fired`.

### Schedule Key
An opaque branded string (`ScheduleKey`) that identifies an EventBridge schedule. Constructed only via `timerScheduleKeys(serverId)`, which returns a `{ deadline: ScheduleKey, lead: ScheduleKey }` pair. Not interchangeable with `serverId`.
