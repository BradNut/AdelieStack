import type { AuditLog, CreateAuditLog } from '#lib/server/api/audit/tables/audit-log.table';
import { uuidv7 } from '#lib/server/api/common/utils/crypto';

/**
 * In-memory stand-in for `AuditRepository`. It genuinely stores rows, reads them back and
 * applies the retention cutoff, so suites exercise real service and job logic instead of
 * asserting on mock calls. Bind it with `mockProvider(AuditRepository, repository)`.
 */
export function createInMemoryAuditRepository() {
  const rows: AuditLog[] = [];

  function toRow(data: CreateAuditLog): AuditLog {
    const now = new Date();
    return {
      id: data.id ?? uuidv7(),
      actor_user_id: data.actor_user_id ?? null,
      action: data.action,
      entity_type: data.entity_type,
      entity_id: data.entity_id ?? null,
      request_id: data.request_id ?? null,
      ip: data.ip ?? null,
      user_agent: data.user_agent ?? null,
      metadata: data.metadata ?? null,
      createdAt: data.createdAt ?? now,
      updatedAt: data.updatedAt ?? now,
    };
  }

  return {
    rows,
    /** Inserts a minimal row created at `createdAt` and returns its id. */
    seed(createdAt: Date): string {
      const row = toRow({ action: 'login_succeeded', entity_type: 'session', createdAt, updatedAt: createdAt });
      rows.push(row);
      return row.id;
    },
    async create(data: CreateAuditLog): Promise<AuditLog> {
      const row = toRow(data);
      rows.push(row);
      return row;
    },
    async findOneById(id: string) {
      return rows.find((row) => row.id === id);
    },
    async findManyByEntity(entityType: string, entityId: string) {
      return rows.filter((row) => row.entity_type === entityType && row.entity_id === entityId).reverse();
    },
    async findManyByActor(actorUserId: string) {
      return rows.filter((row) => row.actor_user_id === actorUserId).reverse();
    },
    async deleteOlderThan(cutoff: Date): Promise<number> {
      const before = rows.length;
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].createdAt < cutoff) rows.splice(i, 1);
      }
      return before - rows.length;
    },
  };
}

export type InMemoryAuditRepository = ReturnType<typeof createInMemoryAuditRepository>;
