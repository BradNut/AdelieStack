# Authentication Feature

## Purpose

Provides user authentication flows: login, signup, password reset, and a Google OAuth entry
point. MFA (TOTP) UI/API plumbing exists but the redirect flow that would activate it is
commented out, so MFA is not a live feature today.

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

### MFA — scaffolded, not live

There is no `/mfa/verify` (or `/totp`) route in the app. The only MFA-related code is the
commented-out block in `login/+page.server.ts` that would call `locals.api.mfa.totp.$get()` and
redirect to a TOTP entry page after a successful password login. Until that block is
re-enabled and a corresponding route is built, logging in never requires a second factor.

### Google OAuth — route stubs, not implemented

A "Google" button is rendered on the login page when `SHOW_OAUTH_BUTTONS` is `true`
(`(auth)/login/+page.svelte`, `oAuthButtons` snippet), and two dedicated routes exist for the
flow:

- `(auth)/login/google/+server.ts` — `GET` handler. Currently just `redirect(302, '/login')`;
  it does not initiate an OAuth authorization request.
- `(auth)/auth/callback/google/+server.ts` — `GET` handler. Currently returns a
  `501 Not Implemented` JSON response (`{ message: 'OAuth not implemented' }`) and does not
  exchange a code, create a session, or touch the API.

There is no corresponding Google OAuth support on the API side (no `iam.google` or similar RPC
endpoint). Treat Google login as a scaffolded route pair behind a feature flag, not a working
sign-in method.

## Routes

### `/login` — Login Page

- **Layout**: `(auth)`
- **Load**: Redirects to `/` if already authenticated; returns `loginForm` and
  `showOAuthButtons` (from `SHOW_OAUTH_BUTTONS` env var)
- **Actions**: `default` — process login form via `locals.api.iam.login.$post`
- **Components**: login form built from `sveltekit-superforms` + Shadcn `Form`/`Input`/`Button`;
  a conditional Google OAuth button rendered inline (no separate `SocialLogin` component)

### `/login/google` — OAuth Entry Stub

- Redirects back to `/login`. Not a working OAuth initiation endpoint yet.

### `/auth/callback/google` — OAuth Callback Stub

- Returns `501 Not Implemented`. Not a working OAuth callback yet.

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
- No MFA and no working social login are enforced today — do not describe either as an active
  second factor or alternate credential path

## Error Handling

### Form Errors

- Field-specific errors set via `setError` (e.g. `identifier`, `username`, `email`, `token`,
  `password`)
- Invalid submissions return `fail(StatusCodes.BAD_REQUEST, ...)` with the form echoed back

### API Errors

- API errors surfaced through `locals.parseApiResponse`'s `{ error }` field are mapped to a
  form field error rather than thrown

## Accessibility

- Semantic form elements via Shadcn `Form` components
- Label associations via `Form.Label` / `Label`
- Field-level error announcements via `Form.FieldErrors`

## Related Documentation

- [Web Coding Standards](../../standards/coding-standards.md)
