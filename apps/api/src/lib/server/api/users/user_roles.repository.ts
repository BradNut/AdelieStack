import { DrizzleService } from '$lib/server/api/databases/postgres/drizzle.service';
import { inject, injectable } from '@needle-di/core';
import { type InferInsertModel, eq } from 'drizzle-orm';
import { takeFirstOrThrow } from '../common/utils/drizzle';
import { user_roles_table } from './tables/user-roles.table';

export type CreateUserRole = InferInsertModel<typeof user_roles_table>;
export type UpdateUserRole = Partial<CreateUserRole>;

@injectable()
export class UserRolesRepository {
  constructor(private drizzle = inject(DrizzleService)) {}

  async findOneById(id: string, db = this.drizzle.db) {
    return db.query.user_roles_table.findFirst({
      where: eq(user_roles_table.id, id),
    });
  }

  async findOneByIdOrThrow(id: string, db = this.drizzle.db) {
    const userRole = await this.findOneById(id, db);
    if (!userRole) throw Error('User not found');
    return userRole;
  }

  async findAllByUserId(userId: string, db = this.drizzle.db) {
    return db.query.user_roles_table.findMany({
      where: eq(user_roles_table.user_id, userId),
    });
  }

  async create(data: CreateUserRole, db = this.drizzle.db) {
    return db.insert(user_roles_table).values(data).returning().then(takeFirstOrThrow);
  }

  async delete(id: string, db = this.drizzle.db) {
    return db.delete(user_roles_table).where(eq(user_roles_table.id, id)).returning().then(takeFirstOrThrow);
  }

  async deleteAllByUserId(userId: string, db = this.drizzle.db) {
    return db.delete(user_roles_table).where(eq(user_roles_table.user_id, userId));
  }
}
