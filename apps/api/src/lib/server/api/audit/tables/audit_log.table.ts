import { getTableColumns, type InferInsertModel, type InferSelectModel, relations } from 'drizzle-orm';
import { index, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { generateId } from '../../common/utils/crypto';
import { id, timestamps } from '../../common/utils/drizzle';
import { users_table } from '../../users/tables/users.table';

/* -------------------------------------------------------------------------- */
/*                                    Table                                   */
/* -------------------------------------------------------------------------- */
/**
 * Append-only log of security-relevant actions (logins, logouts, password and
 * MFA changes, role grants, ...). Rows are written by {@link AuditService} and
 * are never mutated, so no `updated_at` churn is expected.
 */
export const audit_log_table = pgTable(
  'audit_log',
  {
    id: id()
      .primaryKey()
      .$defaultFn(() => generateId()),
    // Nullable: anonymous/unauthenticated events (e.g. a failed login) have no actor.
    actor_user_id: id().references(() => users_table.id),
    action: text().notNull(),
    entity_type: text().notNull(),
    // Nullable: some security events are not scoped to a specific entity.
    entity_id: id(),
    request_id: text(),
    ip: text(),
    user_agent: text(),
    metadata: jsonb(),
    ...timestamps,
  },
  (t) => [
    index('audit_log_actor_idx').on(t.actor_user_id),
    index('audit_log_entity_idx').on(t.entity_type, t.entity_id),
    index('audit_log_action_idx').on(t.action),
    index('audit_log_created_at_idx').on(t.createdAt),
  ],
);

/* -------------------------------------------------------------------------- */
/*                                  Relations                                 */
/* -------------------------------------------------------------------------- */
export const audit_log_relations = relations(audit_log_table, ({ one }) => ({
  actor: one(users_table, {
    fields: [audit_log_table.actor_user_id],
    references: [users_table.id],
  }),
}));

/* -------------------------------------------------------------------------- */
/*                                    Types                                   */
/* -------------------------------------------------------------------------- */
export type AuditLog = InferSelectModel<typeof audit_log_table>;
export type CreateAuditLog = InferInsertModel<typeof audit_log_table>;

const auditLogColumns = getTableColumns(audit_log_table);

export const publicAuditLogColumns = {
  id: auditLogColumns.id,
  actor_user_id: auditLogColumns.actor_user_id,
  action: auditLogColumns.action,
  entity_type: auditLogColumns.entity_type,
  entity_id: auditLogColumns.entity_id,
  request_id: auditLogColumns.request_id,
  ip: auditLogColumns.ip,
  user_agent: auditLogColumns.user_agent,
  metadata: auditLogColumns.metadata,
  ...timestamps,
};
