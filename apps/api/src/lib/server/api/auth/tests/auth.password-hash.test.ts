import { scryptSync } from 'node:crypto';
import { hashPassword as betterAuthDefaultHash } from 'better-auth/crypto';
import { describe, expect, it } from 'vitest';
import { createPasswordHasher } from '#lib/server/api/auth/auth.password-hash';

const { hash: hashPassword, verify: verifyPassword, needsRehash } = createPasswordHasher();

const PASSWORD = 'Correct-horse-9';

describe('password hashing', () => {
  it('hashes with scrypt at an OWASP-recommended cost (N=2^16, r=8, p=2) and verifies the password', async () => {
    const hash = await hashPassword(PASSWORD);

    expect(hash).toMatch(/^\$scrypt\$n=65536,r=8,p=2\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    await expect(verifyPassword({ hash, password: PASSWORD })).resolves.toBe(true);
  });

  it('salts every hash, so the same password never hashes the same twice', async () => {
    expect(await hashPassword(PASSWORD)).not.toBe(await hashPassword(PASSWORD));
  });

  it('refuses a wrong password', async () => {
    const hash = await hashPassword(PASSWORD);

    await expect(verifyPassword({ hash, password: 'Wrong-horse-9' })).resolves.toBe(false);
  });

  it('verifies a hash written by Better Auth before the change, and refuses a wrong password against it', async () => {
    const legacy = await betterAuthDefaultHash(PASSWORD);

    await expect(verifyPassword({ hash: legacy, password: PASSWORD })).resolves.toBe(true);
    await expect(verifyPassword({ hash: legacy, password: 'Wrong-horse-9' })).resolves.toBe(false);
  });

  it('verifies a hash at the cost it records, so raising the cost later keeps older hashes working', async () => {
    // A cheaper cost than today's, as an older setting would have recorded it.
    const cheaper = '$scrypt$n=1024,r=8,p=1$00112233445566778899aabbccddeeff$';
    const key = scryptSync(PASSWORD, '00112233445566778899aabbccddeeff', 16, { N: 1024, r: 8, p: 1 }).toString('hex');

    await expect(verifyPassword({ hash: `${cheaper}${key}`, password: PASSWORD })).resolves.toBe(true);
    expect(needsRehash(`${cheaper}${key}`)).toBe(true);
  });

  it.each([
    ['a missing key', '$scrypt$n=65536,r=8,p=2$00112233445566778899aabbccddeeff$'],
    ['unparseable parameters', '$scrypt$n=big,r=8,p=2$00112233445566778899aabbccddeeff$abcd'],
    ['a non-hex salt', '$scrypt$n=65536,r=8,p=2$not-hex$abcd'],
    ['extra segments', '$scrypt$n=65536,r=8,p=2$0011$abcd$ef'],
  ])('refuses a malformed hash with %s', async (_, hash) => {
    await expect(verifyPassword({ hash, password: PASSWORD })).rejects.toThrow('Invalid password hash');
  });
});

describe('needsRehash', () => {
  it('keeps a hash made at the current cost', async () => {
    expect(needsRehash(await hashPassword(PASSWORD))).toBe(false);
  });

  it('replaces a hash Better Auth wrote at its default cost', async () => {
    expect(needsRehash(await betterAuthDefaultHash(PASSWORD))).toBe(true);
  });

  it('replaces a hash made at another cost, once the cost changes', async () => {
    const raised = createPasswordHasher({ N: 2 ** 10, r: 8, p: 1 });
    const hash = await hashPassword(PASSWORD);

    expect(raised.needsRehash(hash)).toBe(true);
    await expect(raised.verify({ hash, password: PASSWORD })).resolves.toBe(true);
  });

  it('replaces a malformed hash', () => {
    expect(needsRehash('$scrypt$n=65536,r=8,p=2$zz$zz')).toBe(true);
  });
});
