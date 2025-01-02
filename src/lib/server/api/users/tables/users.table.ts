import { boolean, pgTable, text } from 'drizzle-orm/pg-core';
import { getTableColumns, type InferSelectModel, relations } from 'drizzle-orm';
import { citext, id, timestamps } from '../../common/utils/drizzle';
import { generateId } from '../../common/utils/crypto';
import { user_roles_table } from './user-roles.table';

/* -------------------------------------------------------------------------- */
/*                                    Table                                   */
/* -------------------------------------------------------------------------- */
export const users_table = pgTable('users', {
  id: id()
    .primaryKey()
    .$defaultFn(() => generateId()),
  username: text().unique().notNull(),
  email: citext().unique().notNull(),
  first_name: text(),
  last_name: text(),
  email_verified: boolean().default(false),
  mfa_enabled: boolean().notNull().default(false),
  avatar: text(),
  ...timestamps,
});

/* -------------------------------------------------------------------------- */
/*                                  Relations                                 */
/* -------------------------------------------------------------------------- */
export const userRelations = relations(users_table, ({ many }) => ({
  user_roles: many(user_roles_table),
}));

/* -------------------------------------------------------------------------- */
/*                                    Types                                   */
/* -------------------------------------------------------------------------- */
export type User = InferSelectModel<typeof users_table>;
export type UserWithRelations = User & {};

const userColumns = getTableColumns(users_table);

export const publicUserColumns = {
  id: userColumns.id,
  username: userColumns.username,
  email: userColumns.email,
  avatar: userColumns.avatar,
  first_name: userColumns.first_name,
  last_name: userColumns.last_name,
  ...timestamps,
};
