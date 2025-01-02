import { CredentialsType, credentials_table } from './tables/credentials.table';
import { injectable } from '@needle-di/core';
import { and, eq, type InferSelectModel } from 'drizzle-orm';
import { takeFirstOrThrow } from '../common/utils/drizzle';
import { DrizzleRepository } from '../common/factories/drizzle-repository.factory';

/* -------------------------------------------------------------------------- */
/*                                    Types                                   */
/* -------------------------------------------------------------------------- */
type Create = Pick<InferSelectModel<typeof credentials_table>, 'user_id' | 'type' | 'secret_data'>;
type Update = Partial<Create>;

/* -------------------------------------------------------------------------- */
/*                                 Repository                                 */
/* -------------------------------------------------------------------------- */
@injectable()
export class CredentialsRepository extends DrizzleRepository {
  async findOneByUserId(userId: string, db = this.drizzle.db) {
    return db.query.credentials_table.findFirst({
      where: eq(credentials_table.user_id, userId),
    });
  }

  async findOneByUserIdAndType(userId: string, type: CredentialsType, db = this.drizzle.db) {
    return db.query.credentials_table.findFirst({
      where: and(eq(credentials_table.user_id, userId), eq(credentials_table.type, type)),
    });
  }

  async findPasswordCredentialsByUserId(userId: string, db = this.drizzle.db) {
    return db.query.credentials_table.findFirst({
      where: and(eq(credentials_table.user_id, userId), eq(credentials_table.type, CredentialsType.PASSWORD)),
    });
  }

  async findTOTPCredentialsByUserId(userId: string, db = this.drizzle.db) {
    return db.query.credentials_table.findFirst({
      where: and(eq(credentials_table.user_id, userId), eq(credentials_table.type, CredentialsType.TOTP)),
    });
  }

  async findOneById(id: string, db = this.drizzle.db) {
    return db.query.credentials_table.findFirst({
      where: eq(credentials_table.id, id),
    });
  }

  async findOneByIdOrThrow(id: string, db = this.drizzle.db) {
    const credentials = await this.findOneById(id, db);
    if (!credentials) throw Error('Credentials not found');
    return credentials;
  }

  async create(data: Create, db = this.drizzle.db) {
    return db.insert(credentials_table).values(data).returning().then(takeFirstOrThrow);
  }

  async update(id: string, data: Update, db = this.drizzle.db) {
    return db.update(credentials_table).set(data).where(eq(credentials_table.id, id)).returning().then(takeFirstOrThrow);
  }

  async delete(id: string, db = this.drizzle.db) {
    return db.delete(credentials_table).where(eq(credentials_table.id, id));
  }

  async deleteByUserId(userId: string, db = this.drizzle.db) {
    return db.delete(credentials_table).where(eq(credentials_table.user_id, userId));
  }

  async deleteByUserIdAndType(userId: string, type: CredentialsType, db = this.drizzle.db) {
    return db.delete(credentials_table).where(and(eq(credentials_table.user_id, userId), eq(credentials_table.type, type)));
  }
}
