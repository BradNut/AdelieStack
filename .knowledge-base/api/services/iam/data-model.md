# IAM Data Model

Better Auth owns identity and session data. Its tables are generated into
`apps/api/src/lib/server/api/auth/tables/auth.table.ts` (`pnpm --filter @adelie/api auth:generate`) and
re-exported from `apps/api/src/lib/server/api/databases/postgres/drizzle-schema.ts`. Never
hand-edit the generated file or its migrations; change the auth config, regenerate, then run
`drizzle-kit generate`. A test (`auth/tests/auth.schema.test.ts`) fails when the schema lacks a
table or column a configured plugin needs. Read the tables and relations from `auth.table.ts`.

- All auth tables use `text` primary keys filled with a uuidv7 from `generateAuthId`
  (`advanced.database.generateId`), so ids sort by creation time. Domain tables follow the same
  rule; [ADR 0010](../../../../docs/adr/0010-auth-ids-stay-text-uuidv7.md) explains why ids are
  not native `uuid`.
- Sessions live in PostgreSQL, not Redis.
- For email and password sign-in, `accounts.password` holds the hash Better Auth produced.

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
- [Business Processes](./business-processes.md)
- [Context](./context.md)
