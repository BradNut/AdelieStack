import { DrizzleService } from '$lib/server/api/databases/postgres/drizzle.service';
import { inject, injectable } from '@needle-di/core';
import { type InferInsertModel, eq } from 'drizzle-orm';
import { takeFirstOrThrow } from '../common/utils/drizzle';
import { roles_table } from './tables/roles.table';

export type CreateRole = InferInsertModel<typeof roles_table>;
export type UpdateRole = Partial<CreateRole>;

@injectable()
export class RolesRepository {
  constructor(private drizzle = inject(DrizzleService)) {}

  async findOneById(id: string, db = this.drizzle.db) {
    return db.query.roles_table.findFirst({
      where: eq(roles_table.id, id),
    });
  }

  async findOneByIdOrThrow(id: string, db = this.drizzle.db) {
    const role = await this.findOneById(id, db);
    if (!role) throw Error('Role not found');
    return role;
  }

  async findAll(db = this.drizzle.db) {
    return db.query.roles_table.findMany();
  }

  async findOneByName(name: string, db = this.drizzle.db) {
    return db.query.roles_table.findFirst({
      where: eq(roles_table.name, name),
    });
  }

  async findOneByNameOrThrow(name: string, db = this.drizzle.db) {
    const role = await this.findOneByName(name, db);
    if (!role) throw Error('Role not found');
    return role;
  }

  async create(data: CreateRole, db = this.drizzle.db) {
    return db.insert(roles_table).values(data).returning().then(takeFirstOrThrow);
  }

  async update(id: string, data: UpdateRole, db = this.drizzle.db) {
    return db.update(roles_table).set(data).where(eq(roles_table.id, id)).returning().then(takeFirstOrThrow);
  }

  async delete(id: string, db = this.drizzle.db) {
    return db.delete(roles_table).where(eq(roles_table.id, id)).returning().then(takeFirstOrThrow);
  }
}
