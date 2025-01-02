import { injectable } from '@needle-di/core';
import { z } from 'zod';
import { type EnvsDto, envsDto } from './dtos/env.dto';
import * as envs from '$env/static/private';

@injectable()
export class ConfigService {
  envs: EnvsDto;

  constructor() {
    const parsedEnvs = this.parseEnvs();
    if (parsedEnvs === null || parsedEnvs === undefined) {
      throw new Error('Failed to parse environment variables');
    }
    this.envs = parsedEnvs;
  }

  private parseEnvs() {
    return envsDto.parse(envs);
  }

  validateEnvs() {
    try {
      return envsDto.parse(envs);
    } catch (err) {
      if (err instanceof z.ZodError) {
        const { fieldErrors } = err.flatten();
        const errorMessage = Object.entries(fieldErrors)
          .map(([field, errors]) => (errors ? `${field}: ${errors.join(', ')}` : field))
          .join('\n  ');
        throw new Error(`Missing environment variables:\n  ${errorMessage}`);
      }
    }
  }
}
