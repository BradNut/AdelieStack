import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { audit_log_table } from '#lib/server/api/audit/tables/audit-log.table';

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('audit_log primary key', () => {
  const { id } = getTableColumns(audit_log_table);

  it('is a text column', () => {
    expect(id.getSQLType()).toBe('text');
  });

  it('is the primary key and not nullable', () => {
    expect(id.primary).toBe(true);
    expect(id.notNull).toBe(true);
  });

  it('defaults to a fresh UUIDv7 when no id is given', () => {
    const first = id.defaultFn?.();
    const second = id.defaultFn?.();

    expect(first).toMatch(UUID_V7_PATTERN);
    expect(second).toMatch(UUID_V7_PATTERN);
    expect(first).not.toBe(second);
  });

  it('has an app-side default ($defaultFn), not a SQL default', () => {
    expect(id.hasDefault).toBe(true);
    expect(id.default).toBeUndefined();
  });
});
