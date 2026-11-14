import { Environment } from '@adelie/shared';
import { describe, expect, it } from 'vitest';
import { logDestination } from '#lib/server/api/common/services/logger.service';

describe('logDestination', () => {
  it('writes pretty lines in development', () => {
    expect(logDestination(Environment.DEVELOPMENT)).toEqual(expect.objectContaining({ write: expect.any(Function) }));
  });

  it.each([
    ['staging', Environment.STAGING],
    ['production', Environment.PRODUCTION],
    ['unset', undefined],
  ])('leaves pino on its JSON output in %s', (_name, environment) => {
    expect(logDestination(environment)).toBeUndefined();
  });
});
