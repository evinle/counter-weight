# ADR 0001: Show unclaimed-timer prompt after OAuth callback, not before redirect

## Status
Accepted

## Context
When a guest user clicks "Sign in with Google", the app performs a full-page redirect to Cognito and back. If we want to ask the user what to do with their unclaimed timers, we must choose: prompt before the redirect (requiring the choice to survive the page reload via localStorage), or prompt after the callback completes (when `setAuthenticated` fires and `userId` is known).

## Decision
Show the prompt after login — as a modal overlay once `state` transitions to `'authenticated'` and at least one unclaimed timer (`userId: null`) exists in Dexie.

## Consequences
- No cross-redirect persistence needed — the unclaimed timers are still in Dexie when the page reloads after the callback.
- The userId is available when the prompt fires, so the "sync" action can stamp timers immediately without a deferred lookup.
- The main feed renders behind the modal, giving the user visual context for their decision.
- Trade-off accepted: the user briefly sees the app loading before the modal appears, rather than being intercepted before leaving the login screen.
