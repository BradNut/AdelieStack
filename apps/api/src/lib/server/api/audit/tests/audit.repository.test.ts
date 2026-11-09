import { StatusCodes } from '@adelie/shared';
import { describe, expect, it } from 'vitest';
import { AuditRepository } from '#lib/server/api/audit/audit.repository';
import { SecurityAuditAction } from '#lib/server/api/audit/audit.service';
import { DrizzleRepository } from '#lib/server/api/common/factories/drizzle-repository.factory';
import { createTestContainer, mockProvider } from '#lib/server/api/common/testing/test-container';
import { DrizzleService } from '#lib/server/api/databases/postgres/drizzle.service';

interface StubAuditRow {
  id: string;
}

type Connection = DrizzleService['db'];

/** Stands in for a Drizzle connection or transaction: every query settles the way `runQuery` does. */
function createConnection(runQuery: () => Promise<StubAuditRow[]>) {
  const connection = {
    query: { audit_log_table: { findFirst: async () => (await runQuery())[0], findMany: runQuery } },
    insert: () => ({ values: () => ({ returning: runQuery }) }),
    delete: () => ({ where: () => ({ returning: runQuery }) }),
  };
  return connection as unknown as Connection;
}

function connectionReturning(rows: StubAuditRow[]) {
  return createConnection(async () => [...rows]);
}

function resolveRepository(injectedConnection: Connection) {
  return createTestContainer(mockProvider(DrizzleService, { db: injectedConnection })).get(AuditRepository);
}

const newAuditEntry = { action: SecurityAuditAction.LOGIN_SUCCEEDED, entity_type: 'session' };

/** Registers the two connection-selection cases that every repository method has to satisfy. */
function itRunsOnTheSelectedConnection(
  runMethod: (repository: AuditRepository, transaction?: Connection) => Promise<unknown>,
  resultFor: (row: StubAuditRow) => unknown,
) {
  it('runs on the injected connection by default', async () => {
    const injectedRow = { id: 'injected-row' };
    const repository = resolveRepository(connectionReturning([injectedRow]));

    await expect(runMethod(repository)).resolves.toEqual(resultFor(injectedRow));
  });

  it('runs on the transaction it is handed instead of the injected connection', async () => {
    const transactionRow = { id: 'transaction-row' };
    // Two rows, so `deleteOlderThan` counts 2 rather than the transaction's 1 if it runs on the wrong connection.
    const injectedRows = [{ id: 'injected-row' }, { id: 'second-injected-row' }];
    const repository = resolveRepository(connectionReturning(injectedRows));

    await expect(runMethod(repository, connectionReturning([transactionRow]))).resolves.toEqual(resultFor(transactionRow));
  });
}

describe('AuditRepository', () => {
  it('is built on the shared Drizzle repository base', () => {
    expect(resolveRepository(connectionReturning([]))).toBeInstanceOf(DrizzleRepository);
  });

  describe('create', () => {
    itRunsOnTheSelectedConnection(
      (repository, transaction) => repository.create(newAuditEntry, transaction),
      (row) => row,
    );

    it('throws NotFound when the insert returns no row', async () => {
      await expect(resolveRepository(connectionReturning([])).create(newAuditEntry)).rejects.toMatchObject({
        status: StatusCodes.NOT_FOUND,
        message: 'The requested resource was not found.',
      });
    });
  });

  describe('findOneById', () => {
    itRunsOnTheSelectedConnection(
      (repository, transaction) => repository.findOneById('audit-row-id', transaction),
      (row) => row,
    );

    it('resolves undefined when no row has the id', async () => {
      await expect(resolveRepository(connectionReturning([])).findOneById('missing-id')).resolves.toBeUndefined();
    });

    it('propagates the error when the query rejects', async () => {
      const queryError = new Error('connection terminated');
      const repository = resolveRepository(createConnection(() => Promise.reject(queryError)));

      await expect(repository.findOneById('audit-row-id')).rejects.toBe(queryError);
    });
  });

  describe('findManyByEntity', () => {
    itRunsOnTheSelectedConnection(
      (repository, transaction) => repository.findManyByEntity('session', 'session-id', transaction),
      (row) => [row],
    );
  });

  describe('findManyByActor', () => {
    itRunsOnTheSelectedConnection(
      (repository, transaction) => repository.findManyByActor('actor-user-id', transaction),
      (row) => [row],
    );
  });

  describe('deleteOlderThan', () => {
    itRunsOnTheSelectedConnection(
      (repository, transaction) => repository.deleteOlderThan(new Date(), transaction),
      () => 1,
    );

    it('reports zero when nothing is old enough to delete', async () => {
      await expect(resolveRepository(connectionReturning([])).deleteOlderThan(new Date())).resolves.toBe(0);
    });
  });
});
