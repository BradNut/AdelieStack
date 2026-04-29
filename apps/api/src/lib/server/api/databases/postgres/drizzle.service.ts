import Pool from 'pg-pool';
import * as drizzleSchema from './drizzle-schema';
import { inject, injectable } from '@needle-di/core';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { ConfigService } from '../../common/configs/config.service';

@injectable()
export class DrizzleService {
  public db: NodePgDatabase<typeof drizzleSchema>;
  public schema: typeof drizzleSchema = drizzleSchema;

  constructor(private configService = inject(ConfigService)) {
    this.db = drizzle(
      new Pool({
        user: this.configService.envs.DATABASE_USER,
        password: this.configService.envs.DATABASE_PASSWORD,
        host: this.configService.envs.DATABASE_HOST,
        port: Number(this.configService.envs.DATABASE_PORT).valueOf(),
        database: this.configService.envs.DATABASE_DB,
        ssl: false,
        max: this.configService.envs.DB_MIGRATING || this.configService.envs.DB_SEEDING ? 1 : undefined,
      }),
      {
        casing: 'snake_case',
        schema: drizzleSchema,
        logger: this.configService.envs.ENV !== 'prod',
      },
    );
  }
}
