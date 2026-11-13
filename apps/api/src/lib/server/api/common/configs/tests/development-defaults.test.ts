import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DevelopmentDefault } from '#lib/server/api/common/configs/development-defaults.constant';

const repoRoot = resolve(import.meta.dirname, '../../../../../../../../..');
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

const envValue = (file: string, key: string) => new RegExp(`^${key}=(.*)$`, 'm').exec(read(file))?.[1];

describe('DevelopmentDefault', () => {
  it.each(Object.entries(DevelopmentDefault))('matches the published %s in the env schema', (key, value) => {
    expect(envValue('apps/api/.env.schema', key)).toBe(value);
  });

  it('matches the Postgres password docker compose publishes', () => {
    expect(read('docker-compose.yaml')).toContain(`POSTGRES_PASSWORD: ${DevelopmentDefault.DATABASE_PASSWORD}\n`);
  });
});
