import { describe, expect, it } from 'vitest';
import { ENVIRONMENTS, Environment, isDevelopmentEnvironment } from '../environment';

describe('ENVIRONMENTS', () => {
  it('lists the three Environments', () => {
    expect(ENVIRONMENTS).toEqual(['development', 'staging', 'production']);
  });
});

describe('isDevelopmentEnvironment', () => {
  it('is true for development', () => {
    expect(isDevelopmentEnvironment(Environment.DEVELOPMENT)).toBe(true);
  });

  it.each([
    ['staging', Environment.STAGING],
    ['production', Environment.PRODUCTION],
    ['unset', undefined],
    ['empty', ''],
    ['the retired ENV value', 'dev'],
    ['a differently cased value', 'Development'],
  ])('is false for %s', (_name, environment) => {
    expect(isDevelopmentEnvironment(environment)).toBe(false);
  });
});
