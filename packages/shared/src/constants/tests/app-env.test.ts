import { describe, expect, it } from 'vitest';
import { DeployEnvironment, isLocalDevEnv, NodeEnv } from '../app-env';

describe('isLocalDevEnv', () => {
  it('is true only for a development environment run outside a production build', () => {
    expect(isLocalDevEnv({ ENVIRONMENT: DeployEnvironment.DEVELOPMENT, NODE_ENV: NodeEnv.DEVELOPMENT })).toBe(true);
  });

  it.each([
    ['a production build that kept the development default', DeployEnvironment.DEVELOPMENT, NodeEnv.PRODUCTION],
    ['staging', DeployEnvironment.STAGING, NodeEnv.DEVELOPMENT],
    ['a staging production build', DeployEnvironment.STAGING, NodeEnv.PRODUCTION],
    ['production', DeployEnvironment.PRODUCTION, NodeEnv.PRODUCTION],
  ])('is false for %s', (_case, ENVIRONMENT, NODE_ENV) => {
    expect(isLocalDevEnv({ ENVIRONMENT, NODE_ENV })).toBe(false);
  });
});
