import { type InferSelectModel, relations, getTableColumns } from 'drizzle-orm';
import { boolean, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { roles_table } from '../../roles/tables/roles.table';
import { users_table } from './users.table';
import { generateId } from '../../common/utils/crypto';
import { id, timestamps } from '../../common/utils/drizzle';

/* -------------------------------------------------------------------------- */
/*                                    Table                                   */
/* -------------------------------------------------------------------------- */
export const user_roles_table = pgTable('user_roles', {
  id: id()
    .primaryKey()
    .$defaultFn(() => generateId()),
  user_id: id()
    .notNull()
    .references(() => users_table.id, { onDelete: 'cascade' }),
  role_id: id()
    .notNull()
    .references(() => roles_table.id, { onDelete: 'cascade' }),
  primary: boolean().default(false),
  ...timestamps,
});

/* -------------------------------------------------------------------------- */
/*                                  Relations                                 */
/* -------------------------------------------------------------------------- */
export const user_role_relations = relations(user_roles_table, ({ one }) => ({
  role: one(roles_table, {
    fields: [user_roles_table.role_id],
    references: [roles_table.id],
  }),
  user: one(users_table, {
    fields: [user_roles_table.user_id],
    references: [users_table.id],
  }),
}));

/* -------------------------------------------------------------------------- */
/*                                    Types                                   */
/* -------------------------------------------------------------------------- */
export type UserRoles = InferSelectModel<typeof user_roles_table>;
export type UserRolesWithRelations = UserRoles & {};

const userRolesColumns = getTableColumns(user_roles_table);

export const publicUserRolesColumns = {
  id: userRolesColumns.id,
  ...timestamps,
};
