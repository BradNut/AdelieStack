import { relations, type InferSelectModel, getTableColumns } from 'drizzle-orm';
import { pgTable, text } from 'drizzle-orm/pg-core';
import { id, timestamps } from '../../common/utils/drizzle';
import { users_table } from './users.table';
import { generateId } from '../../common/utils/crypto';

/* -------------------------------------------------------------------------- */
/*                                    Table                                   */
/* -------------------------------------------------------------------------- */
export enum CredentialsType {
  SECRET = 'secret',
  PASSWORD = 'password',
  TOTP = 'totp',
  HOTP = 'hotp',
}

export const credentials_table = pgTable('credentials', {
  id: id()
    .primaryKey()
    .$defaultFn(() => generateId()),
  user_id: id()
    .notNull()
    .references(() => users_table.id, { onDelete: 'cascade' }),
  type: text().notNull().default(CredentialsType.PASSWORD),
  secret_data: text().notNull(),
  ...timestamps,
});

/* -------------------------------------------------------------------------- */
/*                                  Relations                                 */
/* -------------------------------------------------------------------------- */
export const credentialsRelations = relations(credentials_table, ({ one }) => ({
  user: one(users_table, {
    fields: [credentials_table.user_id],
    references: [users_table.id],
  }),
}));

/* -------------------------------------------------------------------------- */
/*                                    Types                                   */
/* -------------------------------------------------------------------------- */
export type Credentials = InferSelectModel<typeof credentials_table>;

const credentialsColumns = getTableColumns(credentials_table);

export const publicCredentialsColumns = {
  id: credentialsColumns.id,
  user_id: credentialsColumns.user_id,
  ...timestamps,
};