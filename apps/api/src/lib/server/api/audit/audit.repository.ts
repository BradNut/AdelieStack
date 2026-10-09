import { inject, injectable } from '@needle-di/core';
import { and, desc, eq } from 'drizzle-orm';
import { takeFirstOrThrow } from '../common/utils/drizzle';
import { DrizzleService } from '../databases/postgres/drizzle.service';
import { type AuditLog, audit_log_table, type CreateAuditLog } from './tables/audit_log.table';

@injectable()
export class AuditRepository {
  constructor(private readonly drizzle = inject(DrizzleService)) {}

  async create(data: CreateAuditLog, db = this.drizzle.db): Promise<AuditLog> {
    return db.insert(audit_log_table).values(data).returning().then(takeFirstOrThrow);
  }

  async findOneById(id: string, db = this.drizzle.db) {
    return db.query.audit_log_table.findFirst({
      where: eq(audit_log_table.id, id),
    });
  }

  async findManyByEntity(entityType: string, entityId: string, db = this.drizzle.db) {
    return db.query.audit_log_table.findMany({
      where: and(eq(audit_log_table.entity_type, entityType), eq(audit_log_table.entity_id, entityId)),
      orderBy: desc(audit_log_table.createdAt),
    });
  }

  async findManyByActor(actorUserId: string, db = this.drizzle.db) {
    return db.query.audit_log_table.findMany({
      where: eq(audit_log_table.actor_user_id, actorUserId),
      orderBy: desc(audit_log_table.createdAt),
    });
  }
}
