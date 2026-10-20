# Authentication Feature

## Purpose

Provides user authentication flows: login, signup, password reset, social login (GitHub, Google), two-factor
sign-in, and re-authentication when a session is not fresh.

## User Flows

### Login Flow

1. User navigates to `/login`.
2. `load` in `(auth)/login/+page.server.ts` checks `authedUser` from the parent layout and
   redirects to `/` with a flash message if already signed in.
3. User enters identifier (username or email) and password; form validated with `signinDto`.
4. Submits form (works without JS via the `default` form action).
5. Action re-checks `getAuthedUser()`, then calls `locals.api.iam.login.$post({ json: loginForm.data })`.
6. On error, the password field is cleared and a form error is set on `identifier`.
7. On success, the password/identifier fields are cleared and the user is redirected to `/`
   (`redirect(302, '/', message, event)`) with a "Signed In!" flash message. **There is no
   dashboard route** — `/` is the real success target.
8. The MFA/TOTP branch that would run after a successful login (checking
   `locals.api.mfa.totp.$get()` and redirecting to a TOTP page) is present in
   `login/+page.server.ts` (~lines 60-76) but entirely commented out. It is unreachable dead
   code, not a live flow.

### Signup Flow

> **Registration is closed by default** (`SIGN_UP_ENABLED`, see
> [ADR 0003](../../../../docs/adr/0003-sign-up-closed-by-default.md)). The root layout load reads the
> flag from the public `GET /api/config` endpoint (failing closed on any error) and exposes it as
> `signUpEnabled`. When closed, `/signup` redirects to `/login` with a flash message, the
> "Sign up" link in the auth layout and the landing page's "Create an account" button are hidden,
> and Better Auth's `EMAIL_PASSWORD_SIGN_UP_DISABLED` error shows the shared
> `SIGN_UP_CLOSED_MESSAGE`. While closed, accounts come from the seeded admin
> (`ADMIN_EMAIL`/`ADMIN_PASSWORD`) and the API's admin create-user; there is no admin UI for it yet. The steps below describe the flow when registration is open and
> predate the move to Better Auth.

1. User navigates to `/signup`.
2. `load` redirects to `/` if already authenticated.
3. Enters username, password, confirm password, and optional email; validated client-side and
   server-side with `signupUsernameEmailDto` (via `sveltekit-superforms` + `zod4`).
4. If no email is entered, the UI shows an inline warning that password reset won't be
   available without one — this is a UI hint, not a blocking validation rule.
5. Submits form to the `default` action, which calls `locals.api.signup.$post({ json: form.data })`
   (note: this is the top-level `signup` namespace on the RPC client, **not** `iam.signup`).
6. On error, password fields are cleared and a form error is set on `username`.
7. On success, the user is redirected straight to `/` — there is no "verification email sent"
   step and no separate login redirect; the app does not send a signup verification email in
   this flow.

### Password Reset Flow

Single page, three form actions — not a two-page `/reset-password` + `/reset-password/[token]`
flow. Route: `(auth)/password/reset/+page.server.ts` and `+page.svelte`. The page component
tracks a local `resetEmailStep` state (`"email-reset"` -> `"token-verification"` ->
`"new-password"`) and renders a different form snippet for each step, all on one URL.

1. **`passwordResetRequest` action** — user submits their email (`resetPasswordEmailDto`). Calls
   `locals.api.iam.password.reset.request.$post({ json: emailForm.data })`. On success the UI
   advances to the code-entry step.
2. **`verifyCode` action** — user enters the code emailed to them (`resetPasswordCodeDto`, a
   6-character OTP input). Calls `locals.api.iam.password.reset.verify.$post({ json: tokenForm.data })`.
   On success the UI advances to the new-password step.
3. **`resetPassword` action** — user submits a new password (`resetPasswordNewPasswordDto`).
   Calls `locals.api.iam.password.reset.$post({ json: newPasswordForm.data })`. On success,
   redirects to `/login` with a "Successfully reset password!" flash message.

All three actions redirect already-authenticated users to `/` before processing.

### Two-factor sign-in and re-authentication

The auth client's two-factor plugin has no `onTwoFactorRedirect`: each password sign-in caller checks the
`twoFactorRedirect` result itself (ADR 0008). The login page then navigates to `AppRoute.LOGIN_TWO_FACTOR`; the
re-authentication dialog (`reauth-dialog.svelte`) moves to its challenge step and stays on the page. Both render the
shared `two-factor-challenge.svelte` (authenticator code, emailed code sent only on request, recovery code; never
`trustDevice`).

The sign-in pages finish on `?returnTo=` (`RETURN_TO_PARAM`, read with `returnPathFrom`, app-internal paths only)
and carry it from `/login` to `/login/two-factor`. In the dialog the session cookie is gone once the password is
accepted, so closing at the challenge step (after a warning), an expired or exhausted challenge, or a two-factor
lockout settles the dialog as dismissed and sends the user to `/login?returnTo=<current page>` without replaying the
action. Two-factor users are not offered social providers in the dialog; a passkey alone is enough.

### Social login (GitHub, Google)

Buttons render on `/login` and `/signup` for each provider in `socialProviders`, which the root
layout loads from the public `GET /api/config` (`loadPublicConfig`). A fresh install reports none, so
no buttons render. Clicking one calls `authClient.signIn.social` (`lib/client/social-auth.ts`); the
provider redirects back through `/api/auth/callback/<provider>` (proxied to Better Auth) and a refusal
lands on `/login?error=<code>`, shown with the translated copy for that code (`socialErrorMessage`; messages `auth_social_error_<code>` in `messages/<locale>/auth.json`, codes in `SocialAuthErrorCode`). Only the login page shows it: errors always return there, also when the attempt started on sign-up. Signed-in users
link and unlink providers at `/settings/connected-accounts` (the nav link appears only when a provider
is configured). Setup and linking rules: the API
[environment runbook](../../../api/runbooks/environment-config.md#social-login-github-google).

## Routes

### `/login` — Login Page

- **Layout**: `(auth)`
- **Load**: Redirects to `/` if already authenticated; returns `loginForm` and
  nothing (social providers come from the root layout data)
- **Actions**: `default` — process login form via `locals.api.iam.login.$post`
- **Components**: login form built from `sveltekit-superforms` + Shadcn `Form`/`Input`/`Button`;
  the shared `SocialButtons` component, rendered only for configured providers



### `/signup` — Signup Page

- **Layout**: `(auth)`
- **Load**: Redirects to `/` if already authenticated
- **Actions**: `default` — process signup form via `locals.api.signup.$post`
- **Components**: signup form (username, password, confirm password, optional email) built from
  `sveltekit-superforms` + Shadcn `Form`/`Input`/`Label`/`Button`/`Alert`

### `/password/reset` — Password Reset (single page, three actions)

- **Layout**: `(auth)`
- **Load**: Redirects to `/` if already authenticated; returns `emailForm`, `tokenForm`, and
  `newPasswordForm`
- **Actions**: `passwordResetRequest`, `verifyCode`, `resetPassword` (see flow above)
- **Components**: step-switched form snippets using Shadcn `Form`/`Input`/`InputOTP`/`Card`/`Button`

## State Management

### Local State

- `resetEmailStep` on the password reset page, driving which of the three form snippets is shown
- Superforms-managed field values/errors for each form

### Server State

- `authedUser` from the `(auth)` layout's parent load, used to bounce already-authenticated
  users away from these routes
- Form action results (superforms `form` objects returned to the client)

## API Integration

Calls go through the Hono RPC client exposed as `locals.api` (see `apps/web` hooks setup), not
raw REST fetches. Responses are normalized with `locals.parseApiResponse`, which returns
`{ data, error }`.

```typescript
// Login
const { error } = await locals.api.iam.login.$post({ json: loginForm.data }).then(locals.parseApiResponse);

// Signup (top-level namespace, not under iam)
const { error } = await locals.api.signup.$post({ json: form.data }).then(locals.parseApiResponse);

// Password reset — step 1: request a code
const { error } = await locals.api.iam.password.reset.request.$post({ json: emailForm.data }).then(locals.parseApiResponse);

// Password reset — step 2: verify the code
const { error } = await locals.api.iam.password.reset.verify.$post({ json: tokenForm.data }).then(locals.parseApiResponse);

// Password reset — step 3: set the new password
const { error } = await locals.api.iam.password.reset.$post({ json: newPasswordForm.data }).then(locals.parseApiResponse);
```

## Security Considerations

- Passwords are cleared from form state after both success and failure on login/signup
- Already-authenticated users are redirected away from all auth routes server-side
- Session handling is via `locals.getAuthedUser()` / `locals.api`, not documented here in detail
  (see the core web narrative docs for session/cookie plumbing)
- MFA is not enforced today — do not describe it as an active second factor

## Error Handling

### Form Errors

- Field-specific errors set via `setError` (e.g. `identifier`, `username`, `email`, `token`,
  `password`)
- Invalid submissions return `fail(StatusCodes.BAD_REQUEST, ...)` with the form echoed back

### API Errors

- API errors surfaced through `locals.parseApiResponse`'s `{ error }` field are mapped to a
  form field error rather than thrown

## Emailed links, email change and account deletion

- Verification and email-change links go to Better Auth (`/api/auth/verify-email`), which redirects to a web
  landing page: `/email-verified` or `/email-changed` (`AuthCallbackPath` in `@adelie/shared`). Both render
  `verification-result.svelte`, which shows success or, when Better Auth appended `?error=`, a failure with the
  recovery action (resend, sign in, or request the change again) and reloads the session on success.
- A signed-in user with an unverified email sees a banner with a resend button (`unverified-email-notice.svelte`).
- `/settings/email` starts a change. The confirmation goes to the new address, the old address gets a notice once
  it is followed. For an address that belongs to another account the page shows the same pending message and sends
  nothing, so it does not reveal which addresses are registered.
- The delete-account card on `/settings` confirms with the password; sessions, two-factor and passkey rows are
  removed by cascading foreign keys.

## Accessibility

- Semantic form elements via Shadcn `Form` components
- Label associations via `Form.Label` / `Label`
- Field-level error announcements via `Form.FieldErrors`

## Related Documentation

- [Web Coding Standards](../../standards/coding-standards.md)
