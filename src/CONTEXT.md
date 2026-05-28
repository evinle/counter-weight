# Frontend Context

## Glossary

### Unclaimed Timer
A timer with `userId: null` in Dexie — created while the user was a guest (or before any account existed on the device). Unclaimed timers have `syncStatus: 'synced'` and are never picked up by the sync engine, which filters by `userId === user.userId`. When a user logs in and unclaimed timers exist, they are offered three choices: sync them to the account, keep them local (leave `userId: null`), or remove them.
