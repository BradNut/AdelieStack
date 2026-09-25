import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BucketVisibility, buildBucketName } from '../storage.buckets';

// Local defaults: PROJECT_NAME=adelie, ENVIRONMENT=development (see .env.example).
const DEV_PROJECT_NAME = 'adelie';
const DEV_ENVIRONMENT = 'development';

type S3Identity = {
  name: string;
  credentials?: Array<{ accessKey: string; secretKey: string }>;
  actions: string[];
};

const loadIdentities = (): S3Identity[] => {
  const configUrl = new URL('../../../../../../../../docker/seaweedfs/s3-config.json', import.meta.url);
  return JSON.parse(readFileSync(configUrl, 'utf8')).identities;
};

const findIdentity = (name: string) => loadIdentities().find((identity) => identity.name === name);

describe('docker/seaweedfs/s3-config.json', () => {
  const publicBucket = buildBucketName(DEV_PROJECT_NAME, DEV_ENVIRONMENT, BucketVisibility.PUBLIC);
  const privateBucket = buildBucketName(DEV_PROJECT_NAME, DEV_ENVIRONMENT, BucketVisibility.PRIVATE);

  it('grants anonymous read on the public bucket', () => {
    expect(findIdentity('anonymous')?.actions).toContain(`Read:${publicBucket}`);
  });

  it('never grants anonymous access to the private bucket', () => {
    const actions = findIdentity('anonymous')?.actions ?? [];
    expect(actions.some((action) => action.includes(privateBucket))).toBe(false);
  });

  it('keeps anonymous read-only and bucket-scoped', () => {
    const actions = findIdentity('anonymous')?.actions ?? [];
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      expect(action).toMatch(/^Read:.+/);
    }
  });

  it('defines an admin identity with credentials and full actions', () => {
    const admin = findIdentity('admin');
    expect(admin?.credentials?.length ?? 0).toBeGreaterThan(0);
    for (const verb of ['Admin', 'Read', 'Write', 'List', 'Tagging']) {
      expect(admin?.actions).toContain(verb);
    }
  });
});

describe('buildBucketName', () => {
  it('joins project, visibility, and environment', () => {
    expect(buildBucketName('adelie', 'production', BucketVisibility.PRIVATE)).toBe('adelie-private-production');
  });
});
