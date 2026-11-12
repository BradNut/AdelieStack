---
status: accepted
---

# Audit rows outlive the user they name

`audit_log.actor_user_id` holds a `users.id` but has no foreign key, the same as `entity_id`. Audit Events are written from #191 onward, and with a foreign key, deleting a user who has acted would fail, so account deletion could never succeed. Without one, the Audit Log keeps a deleted account's history, including the "account deleted" row itself, until the 90-day retention job (`AuditCleanupJob`) prunes it. The actor's IP and user agent therefore outlive the account by up to 90 days.

## Considered options

- `ON DELETE SET NULL`: rows survive but lose their actor, so a deleted account's history, and who deleted it, becomes anonymous. Rejected.
- `ON DELETE CASCADE`: deleting an account erases its audit trail. Rejected.

## Consequences

- No `actor` relation in `audit_log_relations`, and the database does not guarantee the id still exists. Readers resolve the user themselves and handle a missing one.
- The change ships as a Drizzle-generated migration.
