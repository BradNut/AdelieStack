import { APP_NAME } from '@adelie/shared';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { getTableColumns, type Table } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import * as drizzleSchema from '../../databases/postgres/drizzle-schema';
import { AUTH_PLACEHOLDER, type Auth, createAuth } from '../auth.config';

type AuthTables = Awaited<Auth['$context']>['tables'];

/** Drizzle export name -> column property names, for every table in `schema`. */
function columnsByExport(schema: Record<string, unknown>): Record<string, string[]> {
  const columns: Record<string, string[]> = {};
  for (const [name, value] of Object.entries(schema)) {
    if (value && typeof value === 'object' && Symbol.for('drizzle:IsDrizzleTable') in value) {
      columns[name] = Object.keys(getTableColumns(value as Table));
    }
  }
  return columns;
}

/**
 * Lists every table or column the configured Better Auth plugins need that `schema` lacks.
 * The adapter uses plural tables, so model `user` is the Drizzle export `users`; a field's
 * name is the Drizzle column property. Fix by regenerating with `pnpm auth:generate`.
 */
function missingFromSchema(tables: AuthTables, schema: Record<string, string[]>): string[] {
  const missing: string[] = [];
  for (const [model, { modelName, fields }] of Object.entries(tables)) {
    const exportName = `${modelName}s`;
    const columns = schema[exportName];
    if (!columns) {
      missing.push(`table ${exportName} (model ${model})`);
      continue;
    }
    const needed = ['id', ...Object.entries(fields).map(([field, { fieldName }]) => fieldName ?? field)];
    for (const column of needed) {
      if (!columns.includes(column)) missing.push(`${exportName}.${column}`);
    }
  }
  return missing;
}

async function configuredTables(): Promise<AuthTables> {
  const auth = createAuth({
    database: memoryAdapter({}),
    secret: AUTH_PLACEHOLDER.secret,
    baseURL: AUTH_PLACEHOLDER.baseURL,
    trustedOrigins: [],
    twoFactorIssuer: APP_NAME,
    passkey: AUTH_PLACEHOLDER.passkey,
    mailer: { send: async () => {} },
  });
  return (await auth.$context).tables;
}

describe('auth schema matches the configured Better Auth plugins', () => {
  const schema = columnsByExport(drizzleSchema);

  it('has every table and column the current auth config needs', async () => {
    expect(missingFromSchema(await configuredTables(), schema)).toEqual([]);
  });

  it('reports a column a plugin needs but the schema lacks', async () => {
    const trimmed = { ...schema, twoFactors: schema.twoFactors.filter((column) => column !== 'lockedUntil') };

    expect(missingFromSchema(await configuredTables(), trimmed)).toEqual(['twoFactors.lockedUntil']);
  });

  it('reports a table a plugin needs but the schema lacks', async () => {
    const { passkeys: _removed, ...trimmed } = schema;

    expect(missingFromSchema(await configuredTables(), trimmed)).toEqual(['table passkeys (model passkey)']);
  });
});
