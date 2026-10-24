import type { HasDefault, HasRuntimeDefault, IsPrimaryKey, NotNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { type ConvertCustomConfig, customType, type PgCustomColumnBuilder, timestamp } from 'drizzle-orm/pg-core';
import type * as drizzleSchema from '#lib/server/api/databases/postgres/drizzle-schema';
import { uuidv7 } from './crypto';
import { NotFound } from './exceptions';

/* -------------------------------------------------------------------------- */
/*                                 Repository                                 */
/* -------------------------------------------------------------------------- */

// get the first element of an array or return null
export const takeFirst = <T>(values: T[]): T | null => {
  return values.shift() || null;
};

// get the first element of an array or throw a 404 error
export const takeFirstOrThrow = <T>(values: T[]): T => {
  const value = values.shift();
  if (!value) throw NotFound('The requested resource was not found.');
  return value;
};

/* -------------------------------------------------------------------------- */
/*                                   Tables                                   */
/* -------------------------------------------------------------------------- */

// custom type for citext
export const citext = customType<{ data: string }>({
  dataType() {
    return 'citext';
  },
});

// custom type for id-holding columns (foreign keys, entity ids). Primary keys use `primaryId()`.
export const id = customType<{ data: string }>({
  dataType() {
    return 'text';
  },
});

// builder returned by `id()`: an unnamed text column holding a string
type IdColumnBuilder = PgCustomColumnBuilder<ConvertCustomConfig<'', { data: string }>>;

// `id()` marked as primary key (so not null) with an app-side default
type PrimaryIdColumnBuilder = HasRuntimeDefault<HasDefault<IsPrimaryKey<NotNull<IdColumnBuilder>>>>;

// primary key for domain tables: a `text` column filled by the app with a uuidv7 (ADR 0010).
export const primaryId = (): PrimaryIdColumnBuilder =>
  id()
    .primaryKey()
    .$defaultFn(() => uuidv7());

// timestamps for created_at and updated_at
export const timestamps = {
  createdAt: timestamp('created_at', {
    mode: 'date',
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', {
    mode: 'date',
    withTimezone: true,
  })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
};

export type Transaction = Parameters<Parameters<NodePgDatabase<typeof drizzleSchema>['transaction']>[0]>[0];
