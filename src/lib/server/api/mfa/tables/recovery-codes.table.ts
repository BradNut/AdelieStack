import {getTableColumns, relations, type InferSelectModel} from 'drizzle-orm';
import {boolean, pgTable, text, uuid} from 'drizzle-orm/pg-core';
import {id, timestamps} from '../../common/utils/drizzle';
import { users_table } from '../../users/tables/users.table';
import { generateId } from '../../common/utils/crypto';

/* -------------------------------------------------------------------------- */
/*                                    Table                                   */
/* -------------------------------------------------------------------------- */
export const recovery_codes_table = pgTable('recovery_codes', {
  id: id()
		.primaryKey()
		.$defaultFn(() => generateId()),
	user_id: id()
		.notNull()
		.references(() => users_table.id)
		.unique('recovery_codes_user_id_unique'),
  code: text().notNull(),
  used: boolean().default(false),
  ...timestamps,
});

/* -------------------------------------------------------------------------- */
/*                                  Relations                                 */
/* -------------------------------------------------------------------------- */
export const recoveryCodesRelations = relations(recovery_codes_table, ({ one }) => ({
  user: one(users_table, {
    fields: [recovery_codes_table.user_id],
    references: [users_table.id],
  }),
}));

/* -------------------------------------------------------------------------- */
/*                                    Types                                   */
/* -------------------------------------------------------------------------- */
export type RecoveryCodesTable = InferSelectModel<typeof recovery_codes_table>;

export const recoveryCodesColumns = getTableColumns(recovery_codes_table);

export const publicRecoveryCodesColumns = {
	id: recoveryCodesColumns.id,
	user_id: recoveryCodesColumns.user_id,
	code: recoveryCodesColumns.code,
	used: recoveryCodesColumns.used,
	...timestamps,
};
