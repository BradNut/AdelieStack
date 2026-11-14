import { describe, expect, it } from 'vitest';
import { ENVIRONMENTS, isDevelopmentEnvironment } from '../environment';

describe('ENVIRONMENTS', () => {
  it('lists the three Environments', () => {
    expect(ENVIRONMENTS).toEqual(['development', 'staging', 'production']);
  });
});

describe('isDevelopmentEnvironment', () => {
  it('is true for development', () => {
    expect(isDevelopmentEnvironment('development')).toBe(true);
  });

  it.each([
    ['staging', 'staging'],
    ['production', 'production'],
    ['unset', undefined],
    ['empty', ''],
    ['the retired ENV value', 'dev'],
    ['a differently cased value', 'Development'],
  ])('is false for %s', (_name, environment) => {
    expect(isDevelopmentEnvironment(environment)).toBe(false);
  });
});
