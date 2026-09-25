# Users Service

## Purpose

Manages the current user's own profile, credentials, and account lifecycle. Every endpoint is
self-service — there is no admin-facing user management API.

## Responsibilities

- Fetching the current user's profile
- Updating profile fields and account-level fields
- Email-change request/verify flow
- Password change
- Account deletion

## Core Features (real endpoints)

All routes are defined in
`apps/api/src/lib/server/api/users/users.controller.ts` and are mounted under `/me`:

- `GET /me` — return the current session's user record.
- `PATCH /me` — update account fields (`multipart/form-data`, via `updateUserDto`); avatar is
  accepted in the form but not otherwise processed by this handler.
- `PUT /me/profile` — update profile fields (`updateProfileDto`).
- `PUT /me/password` — change password; verifies the current password, then invalidates the
  session and clears the session cookie so the user re-authenticates.
- `POST /me/email/request` — request an email change (rate-limited, 5 per 15 minutes); delegates
  to `EmailChangeRequestsService`.
- `POST /me/email/verify` — verify an email-change code (rate-limited, 5 per 15 minutes).
- `DELETE /me` — delete the current user's account, then invalidate the session and clear the
  session cookie.

There is no user listing, search, filtering, pagination, deactivation/reactivation, or
GDPR-specific deletion workflow — `DELETE /me` is a direct delete of the caller's own account.

## Integration Points

- **IAM Service**: sessions (`SessionsService`) are invalidated and the session cookie cleared
  after password change and account deletion; `authState('session')` middleware guards all
  mutating routes.
- **Email Change Requests**: `EmailChangeRequestsService` handles the request/verify email-change
  flow.

There is no Donations service, Requests service, or admin user-management surface in this
codebase.

## Related Documentation

- [API Index](../../index.md)
