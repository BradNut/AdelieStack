---
status: accepted
---

# Sign-up is closed by default; accounts are admin-provisioned

Email/password registration is off unless an operator sets `SIGN_UP_ENABLED=true`. The API passes the flag to Better Auth as `emailAndPassword.disableSignUp`, so a closed install rejects `POST /api/auth/sign-up/email` with `EMAIL_PASSWORD_SIGN_UP_DISABLED`. The web app reads the same flag from the public `GET /api/config` endpoint, redirects `/signup` to `/login`, and hides the sign-up links.

The trigger: sign-up was always on, so any reachable deployment let anyone create an account, and an operator who wanted an invite-only app had no switch for it. Most applications of this kind start with a default admin and let that admin create users, so closed is the safe default for a fresh production install.

## Consequences

- Accounts come from the seeded admin (`ADMIN_EMAIL` / `ADMIN_PASSWORD`) and from the admin plugin's `createUser`. Server-side user creation is not sign-up and is never blocked by the flag. There is no admin UI for it yet.
- With sign-up closed and no `ADMIN_PASSWORD`, nobody can sign in. The seed warns loudly in that case but does not fail.
- **Existing deployments that rely on open sign-up must now set `SIGN_UP_ENABLED=true`.** Local dev and the e2e suite set it, because they register users through sign-up.
- `SIGN_UP_ENABLED` is the single gate for every sign-up method. `auth.sign-up.test.ts` fails when an endpoint with `sign-up` in its path appears that is not in its gated list, so adding a plugin with its own sign-up path forces a decision.
- The flag is read at startup from the environment, so changing it needs a restart.

## Considered options

- A runtime, DB-backed toggle an admin flips in the UI: deferred. It adds a table, an endpoint, caching and an admin screen, and can sit behind the same flag later.
- Open by default: rejected because a forgotten variable would leave a production install publicly registerable.
- First registration becomes the admin, or a one-time setup token: rejected (#68, closed as not planned). Better Auth cannot override `disableSignUp` per request, so it would need its own endpoint, a race-free guard and extra hook wiring. The admin comes from `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
