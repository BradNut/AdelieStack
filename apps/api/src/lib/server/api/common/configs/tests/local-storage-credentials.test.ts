import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../../../../../../../..');
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

const envValue = (file: string, key: string) => new RegExp(`^${key}=(.*)$`, 'm').exec(read(file))?.[1];

/** Words that routinely appear in Better Auth response bodies; varlock flags any response containing a sensitive value. */
const OrdinaryResponseText = [
  'user',
  'password',
  'session',
  'token',
  'email',
  'name',
  'id',
  '{"user":{"id":"x","email":"a@b.c"},"token":"t","redirect":false}',
];

const credentialSource = 'apps/api/.env.schema';
const credentialSources = [credentialSource];

describe('local storage credentials', () => {
  it.each(credentialSources)('%s defaults cannot collide with ordinary response text', (file) => {
    for (const key of ['STORAGE_ACCESS_KEY', 'STORAGE_SECRET_KEY']) {
      const value = envValue(file, key);
      expect(value, `${file} ${key}`).toBeTruthy();
      for (const text of OrdinaryResponseText) {
        expect(text.includes(value as string), `${key} appears in "${text}"`).toBe(false);
      }
    }
  });

  it('match between the env schema and the SeaweedFS identity', () => {
    const config = JSON.parse(read('docker/seaweedfs/s3-config.json')) as {
      identities: { name: string; credentials?: { accessKey: string; secretKey: string }[] }[];
    };
    const admin = config.identities.find((identity) => identity.name === 'admin')?.credentials?.[0];
    for (const file of credentialSources) {
      expect(envValue(file, 'STORAGE_ACCESS_KEY')).toBe(admin?.accessKey);
      expect(envValue(file, 'STORAGE_SECRET_KEY')).toBe(admin?.secretKey);
    }
  });

  it('match the setup script defaults', () => {
    const script = read('scripts/setup-seaweedfs.sh');
    expect(script).toContain(`resolve STORAGE_ACCESS_KEY ${envValue(credentialSource, 'STORAGE_ACCESS_KEY')})`);
    expect(script).toContain(`resolve STORAGE_SECRET_KEY ${envValue(credentialSource, 'STORAGE_SECRET_KEY')})`);
  });
});
