---
status: accepted
---

# Social re-authentication replays a persisted action after the provider redirect

When a sensitive call fails with `SESSION_NOT_FRESH`, the re-authentication dialog also offers each linked, enabled social provider. The provider round trip is a full-page navigation, so the in-memory retry of `withFreshSession` cannot survive it. Before leaving, the app stores a registered action key, its non-secret arguments, the current user id and a timestamp in `sessionStorage`. The app layout reads and clears that entry on return, then runs the action once.

The trigger: users who sign in only through a provider have no password or passkey, and Better Auth only makes a session fresh by creating a new one, which the provider callback does.

## Consequences

- Replayable actions live in a small typed registry. Arguments are limited to non-secret identifiers; credentials and tokens are never stored (OWASP Session Management Cheat Sheet).
- Better Auth's callback signs in whoever owns the chosen provider identity and does not compare it with the current session. The entry is replayed only when the new session's user id matches the stored one; any mismatch drops it with an error.
- Every outcome clears the entry. Entries older than 10 minutes are dropped, replay happens at most once, and nothing is replayed after a provider error.
- The return path is an app-internal relative path, never a free URL (OWASP open-redirect guidance).
- Re-authentication sends `prompt=select_account` and `loginHint` so a provider session does not complete it silently. This is best effort: the provider's own policy decides whether a password is re-entered.
- Provider sign-in does not trigger our TOTP challenge, so a user with two-factor enabled can regain a fresh session with the provider login alone. This is deliberate, as with passkeys, and the alternative would strand social-only two-factor users.
- Actions that are not registered return the user to the page with a "re-authenticated, try again" notice.

## Considered options

- Provider in a popup, keeping the closure alive: rejected because popup blockers and the cross-origin-opener-policy make OAuth in a popup brittle.
- Return to the page and ask the user to repeat the action: rejected because the issue requires the original action to be retried.
- Persisting any closure: not possible, closures cannot be serialised.
