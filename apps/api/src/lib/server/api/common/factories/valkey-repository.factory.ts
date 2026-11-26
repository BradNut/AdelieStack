import { inject } from '@needle-di/core';
import { ValkeyService } from '#lib/server/api/databases/valkey/valkey.service';

export abstract class ValkeyRepository<T extends string> {
  protected readonly valkey: ValkeyService;
  readonly prefix: T;

  constructor(prefix: T, valkey = inject(ValkeyService)) {
    this.prefix = prefix;
    this.valkey = valkey;
  }
}
