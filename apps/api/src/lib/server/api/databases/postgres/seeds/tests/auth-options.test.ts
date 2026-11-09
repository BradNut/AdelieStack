import { PASSWORD_CHECK_UNAVAILABLE, PASSWORD_COMPROMISED } from '@adelie/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeedAuth } from '#lib/server/api/databases/postgres/seeds/auth-options';
import seedUsers from '#lib/server/api/databases/postgres/seeds/users';
import { createTestDatabase, TEST_ORIGIN } from '../../../../../../../test/auth-instance';
import { HIBP_HOST, mockHibp, sha1 } from '../../../../../../../test/mocks/hibp.mock';
import users from '../data/users.json';

const ADMIN = { adminEmail: 'admin@example.com', adminPassword: 'seed-admin-passphrase-1' };
const SEEDED_EMAILS = [ADMIN.adminEmail, ...users.map((user) => user.email)];

/** The auth instance the seed script builds, over a fresh in-memory database, and the seed's user step to run on it. */
function seedWith(HIBP_ENABLED: boolean) {
  const { db, database } = createTestDatabase();
  const auth = createSeedAuth(database, { BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: TEST_ORIGIN, HIBP_ENABLED });
  return { db, seed: () => seedUsers(auth, ADMIN) };
}

const emails = (db: ReturnType<typeof createTestDatabase>['db']) => db.user.map((user) => user.email);

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('seeding and the HIBP_ENABLED switch', () => {
  it('seeds every user during an HIBP outage without a single request when the switch is off', async () => {
    const fetchMock = mockHibp([], 503);
    const { db, seed } = seedWith(false);

    await seed();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(emails(db)).toEqual(SEEDED_EMAILS);
  });

  it('screens every seeded password when the switch is on', async () => {
    const fetchMock = mockHibp();
    const { db, seed } = seedWith(true);

    await seed();

    const lookups = fetchMock.mock.calls.map(([input]) => String(input));
    expect(lookups).toHaveLength(SEEDED_EMAILS.length);
    expect(lookups[0]).toBe(`${HIBP_HOST}${sha1(ADMIN.adminPassword).slice(0, 5)}`);
    expect(emails(db)).toEqual(SEEDED_EMAILS);
  });

  it('rejects a breached admin password when the switch is on, creating nobody', async () => {
    mockHibp([ADMIN.adminPassword]);
    const { db, seed } = seedWith(true);

    await expect(seed()).rejects.toMatchObject({ body: { code: PASSWORD_COMPROMISED } });

    expect(emails(db)).toEqual([]);
  });

  it('fails the seed during an HIBP outage when the switch is on', async () => {
    mockHibp([], 503);
    const { db, seed } = seedWith(true);

    await expect(seed()).rejects.toMatchObject({ body: { code: PASSWORD_CHECK_UNAVAILABLE } });

    expect(emails(db)).toEqual([]);
  });
});
