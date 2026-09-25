import { inject } from '@needle-di/core';
import { DrizzleService } from '../../databases/postgres/drizzle.service';

export abstract class DrizzleRepository {
  protected readonly drizzle: DrizzleService;

  constructor(drizzle = inject(DrizzleService)) {
    this.drizzle = drizzle;
  }
}
