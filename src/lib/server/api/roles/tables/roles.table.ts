import { type InferSelectModel, relations, getTableColumns } from 'drizzle-orm';
import { pgTable, text } from 'drizzle-orm/pg-core';
import { user_roles_table } from '../../users/tables/user-roles.table';
import { timestamps } from '../../common/utils/drizzle';
import { id } from '../../common/utils/drizzle';
import { generateId } from '../../common/utils/crypto';

export enum RoleName {
  ADMIN = 'admin',
  EDITOR = 'editor',
  MODERATOR = 'moderator',
  USER = 'user',
}

/* -------------------------------------------------------------------------- */
/*                                    Table                                   */
/* -------------------------------------------------------------------------- */
export const roles_table = pgTable('roles', {
  id: id()
    .primaryKey()
    .$defaultFn(() => generateId()),
  name: text().unique().notNull(),
  ...timestamps,
});

/* -------------------------------------------------------------------------- */
/*                                  Relations                                 */
/* -------------------------------------------------------------------------- */
export const role_relations = relations(roles_table, ({ many }) => ({
  user_roles: many(user_roles_table),
}));

/* -------------------------------------------------------------------------- */
/*                                    Types                                   */
/* -------------------------------------------------------------------------- */
export type Roles = InferSelectModel<typeof roles_table>;

export type RolesWithRelations = Roles & {};

const roleColumns = getTableColumns(roles_table);

export const publicRoleColumns = {
  id: roleColumns.id,
  name: roleColumns.name,
  ...timestamps,
};

