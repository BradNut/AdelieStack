# IAM Service Dependencies

## Internal Dependencies

### Database Service (Drizzle ORM)
**Package:** `drizzle-orm`
**Location:** `apps/api/src/lib/server/api/databases/`

**Purpose:** IAM does not query the database directly; it goes through the Users service's
repositories (`UsersRepository`, `CredentialsRepository`).

**Usage (actual):**
```typescript
// apps/api/src/lib/server/api/iam/login-requests/login-requests.service.ts
const existingUser = await this.usersRepository.findOneByEmailOrUsername(identifier);
const credential = await this.credentialsRepository.findPasswordCredentialsByUserId(existingUser.id);
```

API source files use relative imports, not the `$lib` alias — IAM code is pulled into the web
typecheck via the RPC contract and must not depend on API-only path aliases.

**Failure Impact:** Critical - cannot authenticate or reset passwords
**Retry Strategy:** None - fail fast

---

### Redis Service
**Package:** `ioredis`
**Location:** `apps/api/src/lib/server/api/databases/redis/redis.service.ts`

**Purpose:** Session storage, short-lived login/reset verification codes, and rate limiting.

**Usage (actual, via the repository factory):**
```typescript
// apps/api/src/lib/server/api/iam/sessions/sessions.repository.ts
export class SessionsRepository extends RedisRepository<'session'> {
  constructor() { super('session'); }

  async get(id: string) {
    const response = await this.redis.get({ prefix: this.prefix, key: id });
    return response ? createSessionDto.parse(JSON.parse(response)) : null;
  }

  create(createSessionDto: CreateSessionDto) {
    const ttlSeconds = dayjs(createSessionDto.expiresAt).diff(dayjs(), 'second');
    if (ttlSeconds <= 0) return Promise.resolve();
    return this.redis.setWithExpiry({ prefix: this.prefix, key: createSessionDto.id, value: JSON.stringify(createSessionDto), expiry: ttlSeconds });
  }
}
```

**Failure Impact:** Critical - cannot create or validate sessions, cannot rate-limit
**Fallback:** None - failures propagate as unhandled exceptions to the shared `onError` handler

---

### Mailer Service
**Location:** `apps/api/src/lib/server/api/mail/{dev,prod}-mailer.service.ts`

**Purpose:** Deliver login-verification-code, password-reset-code, and welcome emails.

**Usage (actual):**
```typescript
// apps/api/src/lib/server/api/iam/login-requests/login-requests.service.ts
await this.mailer.send({ to: email, template: new LoginVerificationEmail(verificationCode) });
```

**Implementations — be precise here, this is a common source of doc drift:**
- `DevMailerService` (used in local/dev): posts the rendered email to a local Mailpit-compatible
  HTTP endpoint (`http://localhost:8025/api/v1/send`) and logs a view URL.
- `ProdMailerService`: is a **stub**. It only `console.log`s the recipient and template — it does
  **not** send real email, despite `usesend-js` being listed as a dependency in
  `apps/api/package.json`. That integration is not wired up. Do not describe this as a working
  transactional-email integration.

**Failure Impact:** `LoginRequestsService`/`ResetPasswordRequestsService` do not catch mailer
errors, so a send failure surfaces as a request failure rather than being swallowed.

There is no `nodemailer` dependency anywhere in `apps/api/package.json`.

---

## Not IAM Dependencies (do not describe as IAM-integrated)

### MFA
A `mfa/` module exists (`apps/api/src/lib/server/api/mfa/`, tables `recovery-codes` and
`two-factor` re-exported via `drizzle-schema.ts`), but no IAM route or service calls into it.
`users_table.mfa_enabled` is set/read elsewhere, not by IAM. See the MFA service docs for the
real MFA implementation.

### Audit
No audit service/module exists anywhere in `apps/api/src`. There is nothing to integrate with.

### WebAuthn / Passkeys
No `@simplewebauthn/server` dependency and no WebAuthn/passkey code exist anywhere in the
repository.

---

## External Dependencies

### Argon2 (not bcrypt)
**Package:** `argon2`
**Version:** `^0.44.0` (`apps/api/package.json`)

**Purpose:** Password and verification-code hashing.

**Usage (actual):**
```typescript
// apps/api/src/lib/server/api/common/services/hashing.service.ts
import { hash, verify } from 'argon2';

export class HashingService {
  hash(data: string) { return hash(data); }
  compare(data: string, encrypted: string) { return verify(encrypted, data); }
}
```

There is no `bcrypt` dependency in `apps/api/package.json`; no bcrypt code exists in this repo.

---

### Zod
**Package:** `zod`
**Version:** `^4.3.6` (`apps/api/package.json`), imported in DTOs as `zod` or `zod/v4`

**Purpose:** Input validation and schema definition for every IAM request body
(`signinDto`, `createLoginRequestDto`, `verifyLoginRequestDto`, `resetPasswordEmailDto`,
`resetPasswordCodeDto`, `resetPasswordNewPasswordDto`), all defined in `@adelie/shared`
(package name `@adelie/shared`, not `@secondchance/shared`).

---

### Hono
**Package:** `hono`

**Purpose:** Web framework. `IamController` extends the shared `Controller` factory
(`common/factories/controllers.factory.ts`) and is mounted at `/api/iam` in
`ApplicationController.registerControllers()`.

---

### hono-rate-limiter / rate-limit-redis
**Purpose:** Backs the `rateLimit` middleware applied to `POST /login` (3 requests/minute).
See `apps/api/src/lib/server/api/common/middleware/rate-limit.middleware.ts`.

---

## Shared Constants

### From `@adelie/shared`
```typescript
import { signinDto, createLoginRequestDto, verifyLoginRequestDto } from '@adelie/shared';
```
IAM code imports DTOs from `@adelie/shared`, not constants named `CredentialsType` — the
credentials-table `CredentialsType` enum used by IAM's password lookups is defined locally in
`apps/api/src/lib/server/api/users/tables/credentials.table.ts` and is a different value set
than the `CredentialsType` const object exported from
`packages/shared/src/domain/credentials-type.ts` (see [Data Model](./data-model.md)).

---

## Environment Variables

Real variables read by this module and its direct dependencies, per `apps/api/.env.schema`:

```bash
# Session signing
SIGNING_SECRET=      # required, sensitive — used to sign the session cookie
ENV=dev              # dev|prod — controls the cookie's `secure` flag

# Redis
REDIS_URL=redis://localhost:6379
```

There are no `SMTP_*`, `BCRYPT_ROUNDS`, `SESSION_EXPIRY_DAYS`, or `CSRF_SECRET` variables in
`apps/api/.env.schema`; the mailer implementations do not read SMTP configuration (see above).

---

## Related Documentation

- [Overview](./overview.md)
- [Context](./context.md)
- [Data Model](./data-model.md)
- [Runbook](./runbook.md)
