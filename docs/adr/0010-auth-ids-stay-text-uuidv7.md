---
status: accepted
---

# Row ids are app-generated UUIDv7 stored as `text`, not native `uuid`

Better Auth tables and domain tables use `text` primary keys filled with our own `uuidv7()`. We do not use Postgres's native `uuid` type, even though it is smaller (16 bytes instead of 37) and RFC 9562 §6.13 recommends binary storage. Better Auth's Drizzle schema generator only emits `uuid` columns under `advanced.database.generateId: "uuid"`, and then fills them in the database with `gen_random_uuid()` (v4). That loses the time ordering that keeps btree inserts local. At auth-table sizes the storage saving is small, and working around the generator costs more.

We picked v7 rather than v8 because RFC 9562 §5.7 recommends v7 for new time-ordered keys, and v8 is meant for custom layouts we don't need. Ids are only roughly time-ordered: there is no counter within a millisecond, so anything that needs a strict order sorts by `created_at`.

## Consequences

- Domain tables get their primary key from the shared `primaryId()` Drizzle helper (v7). An id that leaves the system (URL, UI, cookie, storage key) is a separate Public Id, never the primary key; see [ADR 0011](./0011-public-ids-are-nanoid.md).
- Foreign keys to `users.id` (such as `audit_log.actor_user_id`) stay `text`.
- With a function `generateId`, Better Auth writes base64url digests as ids for single-use records (SAML assertions, DPoP, `private_key_jwt`). A `text` column accepts them. A `uuid` column would reject them.
- Revisit when Better Auth ships a `"uuidv7"` `generateId` mode that creates native `uuid` columns. PR better-auth/better-auth#6555 was meant to add this, but its merged diff contains no id code, and better-auth/better-auth#11394 asks about its status.

## Considered options

- `generateId: "uuid"`: native `uuid` columns that the generator supports, but database-generated v4 ids are not time-ordered. Rejected.
- Native `uuid` with a v7 database default (`uuidv7()` on Postgres 18, `generateId: false`): needs a hand-edited or post-processed `auth.table.ts`, which the IAM data model forbids, and breaks the base64url single-use ids. Rejected.
