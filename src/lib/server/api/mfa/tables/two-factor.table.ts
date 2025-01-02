import { type InferSelectModel, relations, getTableColumns } from 'drizzle-orm';
import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { id, timestamps } from '../../common/utils/drizzle';
import { users_table } from '../../users/tables/users.table';
import { generateId } from '../../common/utils/crypto';

/* -------------------------------------------------------------------------- */
/*                                    Table                                   */
/* -------------------------------------------------------------------------- */
export const two_factor_table = pgTable('two_factor', {
  id: id()
    .primaryKey()
    .$defaultFn(() => generateId()),
  user_id: id()
    .notNull()
    .references(() => users_table.id)
    .unique('two_factor_user_id_unique'),
  secret: text().notNull(),
  enabled: boolean().notNull().default(false),
  ...timestamps,
});

/* -------------------------------------------------------------------------- */
/*                                  Relations                                 */
/* -------------------------------------------------------------------------- */
export const emailVerificationsRelations = relations(two_factor_table, ({ one }) => ({
  user: one(users_table, {
    fields: [two_factor_table.user_id],
    references: [users_table.id],
  }),
}));

/* -------------------------------------------------------------------------- */
/*                                    Types                                   */
/* -------------------------------------------------------------------------- */
export type TwoFactor = InferSelectModel<typeof two_factor_table>;

export const twoFactorColumns = getTableColumns(two_factor_table);

export const publicTwoFactorColumns = {
  id: twoFactorColumns.id,
  user_id: twoFactorColumns.user_id,
  ...timestamps,
};