import { inject, injectable } from '@needle-di/core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { ConfigService } from '#lib/server/api/common/configs/config.service';
import { createPostgresDb } from './drizzle.client';
import * as drizzleSchema from './drizzle-schema';
import { postgresSsl } from './postgres-ssl';

@injectable()
export class DrizzleService {
  public db: NodePgDatabase<typeof drizzleSchema>;
  public schema: typeof drizzleSchema = drizzleSchema;

  constructor(private configService = inject(ConfigService)) {
    const { DATABASE_USER, DATABASE_PASSWORD, DATABASE_HOST, DATABASE_PORT, DATABASE_DB, DATABASE_SSL_MODE, ENV } = this.configService.envs;
    this.db = createPostgresDb({
      user: DATABASE_USER,
      password: DATABASE_PASSWORD,
      host: DATABASE_HOST,
      port: DATABASE_PORT,
      database: DATABASE_DB,
      ssl: postgresSsl(DATABASE_SSL_MODE),
      env: ENV,
    });
  }
}
