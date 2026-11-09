import { createHash } from 'node:crypto';
import { PASSWORD_CHECK_UNAVAILABLE, PASSWORD_COMPROMISED } from '@adelie/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedAuthOptions } from '#lib/server/api/databases/postgres/seeds/auth-options';
import seedUsers from '#lib/server/api/databases/postgres/seeds/users';
import { createTestAuth, TEST_ORIGIN } from '../../../../../../../test/auth-instance';

const HIBP_HOST = 'https://api.pwnedpasswords.com/range/';
const ADMIN = { adminEmail: 'admin@example.com', adminPassword: 'seed-admin-passphrase-1' };
const SEEDED_EMAILS = ['admin@example.com', 'john.smith@example.com', 'jane.doe@example.com', 'jane.support@example.com'];

const sha1 = (value: string) => createHash('sha1').update(value).digest('hex').toUpperCase();

/** Answers HIBP range lookups with the given status, reporting `pwned` passwords as breached; returns the mock so tests can inspect outbound calls. */
function mockHibp(status = 200, pwned: string[] = []) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith(HIBP_HOST)) throw new Error(`unexpected network call: ${url}`);
    const breached = pwned.map((password) => `${sha1(password).slice(5)}:42`);
    return new Response(['0000000000000000000000000000000000A:0', ...breached].join('\r\n'), { status });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Runs the seed's user step on an auth instance built from the options the seed script uses. */
function seedWith(HIBP_ENABLED: boolean) {
  const { auth, db } = createTestAuth(seedAuthOptions({ BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: TEST_ORIGIN, HIBP_ENABLED }));
  return { db, seeding: seedUsers(auth, ADMIN) };
}

const emails = (db: ReturnType<typeof createTestAuth>['db']) => db.user.map((user) => user.email);

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('seeding and the HIBP_ENABLED switch', () => {
  it('makes no HIBP request when the switch is off', async () => {
    const fetchMock = mockHibp();
    const { db, seeding } = seedWith(false);

    await seeding;

    expect(fetchMock).not.toHaveBeenCalled();
    expect(emails(db)).toEqual(SEEDED_EMAILS);
  });

  it('still seeds every user during an HIBP outage when the switch is off', async () => {
    const fetchMock = mockHibp(503);
    const { db, seeding } = seedWith(false);

    await expect(seeding).resolves.toBeUndefined();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(emails(db)).toEqual(SEEDED_EMAILS);
  });

  it('screens every seeded password when the switch is on', async () => {
    const fetchMock = mockHibp();
    const { db, seeding } = seedWith(true);

    await seeding;

    const lookups = fetchMock.mock.calls.map(([input]) => String(input));
    expect(lookups).toHaveLength(SEEDED_EMAILS.length);
    expect(lookups[0]).toBe(`${HIBP_HOST}${sha1(ADMIN.adminPassword).slice(0, 5)}`);
    expect(emails(db)).toEqual(SEEDED_EMAILS);
  });

  it('rejects a breached admin password when the switch is on, creating nobody', async () => {
    mockHibp(200, [ADMIN.adminPassword]);
    const { db, seeding } = seedWith(true);

    await expect(seeding).rejects.toMatchObject({ body: { code: PASSWORD_COMPROMISED } });

    expect(emails(db)).toEqual([]);
  });

  it('fails the seed during an HIBP outage when the switch is on', async () => {
    mockHibp(503);
    const { db, seeding } = seedWith(true);

    await expect(seeding).rejects.toMatchObject({ body: { code: PASSWORD_CHECK_UNAVAILABLE } });

    expect(emails(db)).toEqual([]);
  });
});
