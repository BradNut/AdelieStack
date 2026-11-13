import { describe, expect, it } from 'vitest';
import { POSTGRES_SSL_MODES, PostgresSslMode, postgresSsl } from '#lib/server/api/databases/postgres/postgres-ssl';

describe('postgresSsl', () => {
  it('connects without TLS when the mode is disable', () => {
    expect(postgresSsl(PostgresSslMode.DISABLE)).toBe(false);
  });

  it.each([
    { name: 'unset', value: undefined },
    { name: 'empty', value: '' },
  ])('connects without TLS when the mode is $name, as local development does', ({ value }) => {
    expect(postgresSsl(value)).toBe(false);
  });

  it('requires TLS and verifies the certificate when the mode is verify-full', () => {
    expect(postgresSsl(PostgresSslMode.VERIFY_FULL)).toEqual({ rejectUnauthorized: true });
  });

  it('requires TLS without verifying the certificate only when the mode explicitly opts out', () => {
    expect(postgresSsl(PostgresSslMode.REQUIRE)).toEqual({ rejectUnauthorized: false });
  });

  it('declares exactly the three modes the runbook documents', () => {
    expect([...POSTGRES_SSL_MODES].sort()).toEqual(['disable', 'require', 'verify-full']);
  });

  it('keeps the values operators type into DATABASE_SSL_MODE, libpq sslmode names', () => {
    expect(PostgresSslMode).toEqual({ DISABLE: 'disable', VERIFY_FULL: 'verify-full', REQUIRE: 'require' });
  });

  it.each([
    { name: '"true"', value: 'true' },
    { name: '"VERIFY-FULL"', value: 'VERIFY-FULL' },
    { name: '"prefer"', value: 'prefer' },
  ])('refuses an unknown mode $name rather than silently connecting without TLS', ({ value }) => {
    expect(() => postgresSsl(value)).toThrowError(`DATABASE_SSL_MODE must be one of disable, verify-full, require; got "${value}"`);
  });
});
