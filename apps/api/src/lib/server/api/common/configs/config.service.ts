import { injectable } from '@needle-di/core';
import { z } from 'zod/v4';
import { type EnvsDto, envsDto } from './dtos/env.dto';

@injectable()
export class ConfigService {
  envs: EnvsDto;

  constructor() {
    const parsedEnvs = this.validateEnvs();
    if (!parsedEnvs) {
      throw new Error('Failed to parse environment variables');
    }
    this.envs = parsedEnvs;
  }

  validateEnvs() {
    try {
      return envsDto.parse(process.env);
    } catch (err) {
      if (err && typeof err === 'object' && 'issues' in err) {
        const zodError = err as z.ZodError;
        const { fieldErrors }: { fieldErrors: Record<string, string[]> } = z.flattenError(zodError);
        const errorMessage = Object.entries(fieldErrors)
          .map(([field, errors]) => (errors ? `${field}: ${errors.join(', ')}` : field))
          .join('\n  ');
        throw new Error(`Missing environment variables:\n  ${errorMessage}`);
      }

      throw err;
    }
  }
}
