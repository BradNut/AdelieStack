---
status: accepted
---

# Social sign-in by a two-factor user requires the Second Factor

Better Auth raises the Two-factor Challenge only after password sign-ins, so a user with two-factor enabled who signed in through a linked social provider got a full session with no Second Factor. Two-factor protected their password but not their account, and whoever controlled the provider account got past it. We now raise the same challenge after the provider round trip. A passkey sign-in stays exempt, because a passkey on its own proves possession plus a PIN or biometric ([ADR 0008](./0008-two-factor-reauthentication-requires-every-factor.md)).

To keep the challenge logic in Better Auth ([ADR 0009](./0009-better-auth-owns-the-auth-core.md)), we add the social callback and social sign-in endpoints to the two-factor plugin's own after-hook matcher. A later hook of ours turns the plugin's JSON `twoFactorRedirect` answer on the callback into a browser redirect to the Two-factor Challenge page.

## Consequences

- The wrapper depends on the shape of the plugin's `hooks.after`, which is a Better Auth internal. The API tests of this behaviour are what catch a break on upgrade. If Better Auth gains a configurable path list, the wrapper can go.
- The redirect hook must run after the Replaced Session hook, which reads `twoFactorRedirect` from the response to know a challenge was raised.
- The id-token sign-in answers a fetch, so it returns `twoFactorRedirect` as a password sign-in does. Linking from settings shares the callback but creates no new session, so it raises no challenge.
- The user lands on the home page after the challenge, as a social sign-in does today. No return path is carried through it.
- Better Auth links a matching verified provider before the session exists, so an abandoned challenge can leave a Sign-in Account the user did not add. It gives no session: every sign-in through it is challenged, and two-factor users cannot re-authenticate with it. The user can unlink it from settings.
- The re-authentication dialog still does not offer providers to two-factor users, and the challenge now also applies to a hand-crafted provider re-authentication on the server.
- A valid trust-device cookie skips the challenge here, as it already does after a password. Our UI never requests one, but a direct API call can. This gap existed before this decision and is unchanged by it.

## Considered options

- Refuse social sign-in for two-factor users: rejected. It strands nobody, since every two-factor user has a password, but the user only finds out after the provider round trip, and a linked provider stops being a way to sign in.
- Accept the provider's own multi-factor check: rejected. We cannot see whether the provider applied one, and it conflicts with requiring every factor.
- Copy the plugin's challenge code into our own after-hook: rejected. It duplicates security-critical code and hardcodes the plugin's cookie name and identifier formats, which can change silently.
- Wait for a configurable path list upstream: rejected for now. The bypass would stay open with no date for a fix.
- Block implicit provider linking for two-factor users: rejected. A legitimate user's first sign-in with a same-email provider would fail, to stop an attacker who gains no session anyway.
