import { injectable } from '@needle-di/core';
import { takeFirst, takeFirstOrThrow } from '../common/utils/drizzle';
import { users_table } from './tables/users.table';
import { eq, or, type InferSelectModel } from 'drizzle-orm';
import { NotFound } from '../common/utils/exceptions';
import { DrizzleRepository } from '../common/factories/drizzle-repository.factory';

/* -------------------------------------------------------------------------- */
/*                                    Types                                   */
/* -------------------------------------------------------------------------- */
type Create = Pick<InferSelectModel<typeof users_table>, 'avatar' | 'email' | 'username' | 'first_name' | 'last_name'>;
type Update = Partial<Create>;

/* -------------------------------------------------------------------------- */
/*                                 Repository                                 */
/* -------------------------------------------------------------------------- */
@injectable()
export class UsersRepository extends DrizzleRepository {
  async findOneById(id: string, db = this.drizzle.db) {
    return db.select().from(users_table).where(eq(users_table.id, id)).then(takeFirst);
  }

  async findOneByEmailOrUsername(identifier: string, db = this.drizzle.db) {
    return db
      .select()
      .from(users_table)
      .where(or(eq(users_table.email, identifier), eq(users_table.username, identifier)))
      .then(takeFirst);
  }

  async findOneByEmail(email: string, db = this.drizzle.db) {
    return db.select().from(users_table).where(eq(users_table.email, email)).then(takeFirst);
  }

  async findOneByUsername(username: string, db = this.drizzle.db) {
    return db.select().from(users_table).where(eq(users_table.username, username)).then(takeFirst);
  }

  async findOneByIdOrThrow(id: string, db = this.drizzle.db) {
    const user = await this.findOneById(id, db);
    if (!user) {
      throw NotFound('User not found');
    }
    return user;
  }

  async update(id: string, data: Update, db = this.drizzle.db) {
    return db.update(users_table).set(data).where(eq(users_table.id, id)).returning();
  }

  async create(data: Create, db = this.drizzle.db) {
    return db.insert(users_table).values(data).returning().then(takeFirstOrThrow);
  }

  async delete(id: string, db = this.drizzle.db) {
    return db.delete(users_table).where(eq(users_table.id, id)).returning().then(takeFirstOrThrow);
  }
}
