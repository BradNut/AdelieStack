# IAM Data Model

Better Auth owns identity and session data. Its tables are generated into
`apps/api/src/lib/server/api/auth/tables/auth.table.ts` (`pnpm --filter @adelie/api auth:generate`) and
re-exported from `apps/api/src/lib/server/api/databases/postgres/drizzle-schema.ts`. Never
hand-edit the generated file or its migrations; change the auth config, regenerate, then run
`drizzle-kit generate`. A test (`auth/tests/auth.schema.test.ts`) fails when the schema lacks a
table or column a configured plugin needs.

## Database Schema (PostgreSQL via Drizzle)

All auth tables use `text` primary keys filled with a uuidv7 from `generateAuthId`
(`advanced.database.generateId`), so ids sort by creation time.

### `users`

| Column | Notes |
| --- | --- |
| `id`, `name`, `email` (unique), `image` | Identity |
| `email_verified` | Set by the email verification flow |
| `role` | `admin`, `support` or `user`; admin plugin, defaults to `user` |
| `banned`, `ban_reason`, `ban_expires` | Admin plugin |
| `two_factor_enabled` | Two-factor plugin |
| `created_at`, `updated_at` | Timestamps |

### `sessions`

One row per signed-in browser: `token` (unique), `expires_at`, `ip_address`, `user_agent`,
`impersonated_by`, and `user_id` (cascade delete). Sessions live in PostgreSQL, not Redis.

### `accounts`

One row per sign-in method of a user (`provider_id`, `account_id`, `user_id`). For email and
password the `password` column holds the hash Better Auth produced; OAuth token columns exist
for providers added later.

### `verifications`

Short-lived tokens for email verification and password reset: `identifier`, `value`,
`expires_at`.

### `two_factors` and `passkeys`

Created by the two-factor and passkey plugins. See the [security standards](../../standards/security-standards.md) for the overview.

### Relations

```
users (1) ──< (N) sessions      (sessions.user_id → users.id, cascade delete)
users (1) ──< (N) accounts      (accounts.user_id → users.id, cascade delete)
users (1) ──< (N) two_factors   (cascade delete)
users (1) ──< (N) passkeys      (cascade delete)
```

## Roles

`RoleName` in `@adelie/shared` defines the three roles. The admin plugin stores the role on
`users.role`; `ac` and `roles` in `auth/auth.permissions.ts` map each role to its admin-plugin
permissions:

- `admin`: every admin-plugin permission
- `support`: none. Support reaches only the routes shared with admin (`adminAndSupportRoleOnly`)
- `user`: none

Only the admin endpoints and server-side calls (such as the seed) can set a role.

## Data Lifecycle

### Session Lifecycle
1. **Creation**: on sign-in, a `sessions` row is inserted and a signed `httpOnly` cookie is set.
2. **Active**: the `authSession` middleware resolves the cookie to a session and user on every
   request; Better Auth extends the expiry and re-sets the cookie as it ages.
3. **Expiration**: an expired session is treated as absent.
4. **Revocation**: signing out deletes the session row and clears the cookie.

### Verification Lifecycle
1. **Creation**: sign-up and password reset each insert a `verifications` row and
   email a link through the mailer.
2. **Consumption**: following the link consumes the token; expired tokens are rejected.

## Data Security

- Passwords are never stored in plaintext; `accounts.password` holds the hash Better Auth made.
- The session token is opaque and only ever transmitted inside a signed, `httpOnly` cookie.
- `BETTER_AUTH_SECRET` (min 32 chars) signs cookies and encrypts secrets Better Auth stores.

## Migration Considerations

- Use Drizzle migrations (`drizzle-kit generate`); never hand-edit migration SQL or
  `drizzle/meta/**`.
- Adding or changing a Better Auth plugin means rerunning `auth:generate`, then generating the
  migration.

## Related Documentation

- [Overview](./overview.md)
- [API Documentation](./api-doc.md)
- [Business Processes](./business-processes.md)
- [Context](./context.md)
