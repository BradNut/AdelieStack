import { describe, expect, it } from 'vitest';
import { AuditRepository } from '#lib/server/api/audit/audit.repository';
import { DrizzleRepository } from '#lib/server/api/common/factories/drizzle-repository.factory';
import { createTestContainer, mockProvider } from '#lib/server/api/common/testing/test-container';
import { DrizzleService } from '#lib/server/api/databases/postgres/drizzle.service';

type Row = { id: string };

/** Stands in for a Drizzle connection or transaction: every query answers with `rows`. */
function createFakeDb(rows: Row[]) {
  const fake = {
    query: { audit_log_table: { findFirst: async () => rows[0], findMany: async () => rows } },
    insert: () => ({ values: () => ({ returning: async () => [...rows] }) }),
    delete: () => ({ where: () => ({ returning: async () => [...rows] }) }),
  };
  return fake as unknown as DrizzleService['db'];
}

function buildRepository(rows: Row[]) {
  const container = createTestContainer(mockProvider(DrizzleService, { db: createFakeDb(rows) }));
  return container.get(AuditRepository);
}

const auditRow = { action: 'login_succeeded', entity_type: 'session' };

describe('AuditRepository', () => {
  it('is built on the shared Drizzle repository base', () => {
    expect(buildRepository([])).toBeInstanceOf(DrizzleRepository);
  });

  it('runs every query on the injected connection by default', async () => {
    const row = { id: 'injected' };
    const repository = buildRepository([row]);

    await expect(repository.create(auditRow)).resolves.toEqual(row);
    await expect(repository.findOneById('injected')).resolves.toEqual(row);
    await expect(repository.findManyByEntity('session', 'sess-1')).resolves.toEqual([row]);
    await expect(repository.findManyByActor('user-1')).resolves.toEqual([row]);
    await expect(repository.deleteOlderThan(new Date())).resolves.toBe(1);
  });

  it('runs every query on the transaction it is handed instead of the injected connection', async () => {
    const row = { id: 'transaction' };
    const transaction = createFakeDb([row]);
    const repository = buildRepository([{ id: 'injected' }, { id: 'injected-too' }]);

    await expect(repository.create(auditRow, transaction)).resolves.toEqual(row);
    await expect(repository.findOneById('transaction', transaction)).resolves.toEqual(row);
    await expect(repository.findManyByEntity('session', 'sess-1', transaction)).resolves.toEqual([row]);
    await expect(repository.findManyByActor('user-1', transaction)).resolves.toEqual([row]);
    await expect(repository.deleteOlderThan(new Date(), transaction)).resolves.toBe(1);
  });

  it('fails a create when the insert returns no row', async () => {
    await expect(buildRepository([]).create(auditRow)).rejects.toThrow();
  });

  it('reports zero when nothing is old enough to delete', async () => {
    await expect(buildRepository([]).deleteOlderThan(new Date())).resolves.toBe(0);
  });
});
