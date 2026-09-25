import type { Context } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createConfigServiceMock } from '../../../../../../test/mocks/config.mock';
import { TimeSpan } from '../../../../../utils/timespan';
import { ConfigService } from '../../../common/configs/config.service';
import { RequestContextService } from '../../../common/services/request-context.service';
import { buildSession, TEST_NOW, TEST_USER_ID } from '../../../common/testing/factories';
import { runInHonoContext } from '../../../common/testing/hono-context';
import { createTestContainer, mockProvider } from '../../../common/testing/test-container';
import type { HonoEnv } from '../../../common/utils/hono';
import { SessionsRepository } from '../sessions.repository';
import { SessionsService } from '../sessions.service';

const THIRTY_DAYS_MS = new TimeSpan(30, 'd').milliseconds();
const FIFTEEN_DAYS_MS = new TimeSpan(15, 'd').milliseconds();

function createSessionsRepositoryMock() {
  return {
    get: vi.fn<SessionsRepository['get']>(),
    create: vi.fn<SessionsRepository['create']>(async () => undefined),
    delete: vi.fn<SessionsRepository['delete']>(async () => undefined),
  };
}

describe('SessionsService', () => {
  let sessionsRepository: ReturnType<typeof createSessionsRepositoryMock>;
  let requestContext: { getContext: ReturnType<typeof vi.fn<() => Context<HonoEnv>>> };
  let config: ReturnType<typeof createConfigServiceMock>;

  function createService() {
    return createTestContainer(
      mockProvider(SessionsRepository, sessionsRepository),
      mockProvider(RequestContextService, requestContext),
      mockProvider(ConfigService, config),
    ).get(SessionsService);
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(TEST_NOW);
    sessionsRepository = createSessionsRepositoryMock();
    requestContext = { getContext: vi.fn<() => Context<HonoEnv>>() };
    config = createConfigServiceMock();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createSession', () => {
    it('persists a fresh 30 day session for the user', async () => {
      const session = await createService().createSession(TEST_USER_ID);

      expect(session).toMatchObject({ userId: TEST_USER_ID, fresh: true, createdAt: TEST_NOW });
      expect(session.expiresAt.getTime()).toBe(TEST_NOW.getTime() + THIRTY_DAYS_MS);
      expect(session.id).toMatch(/^[0-9A-Za-z]{16}$/);
      expect(sessionsRepository.create).toHaveBeenCalledExactlyOnceWith({
        id: session.id,
        userId: TEST_USER_ID,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      });
    });

    it('generates a distinct id for every session', async () => {
      const service = createService();
      const [a, b] = await Promise.all([service.createSession(TEST_USER_ID), service.createSession(TEST_USER_ID)]);

      expect(a.id).not.toBe(b.id);
    });

    it('propagates storage failures', async () => {
      sessionsRepository.create.mockRejectedValueOnce(new Error('redis unavailable'));

      await expect(createService().createSession(TEST_USER_ID)).rejects.toThrow('redis unavailable');
    });
  });

  describe('validateSession', () => {
    it('returns null when the session does not exist', async () => {
      sessionsRepository.get.mockResolvedValueOnce(null);

      await expect(createService().validateSession('missing')).resolves.toBeNull();
      expect(sessionsRepository.create).not.toHaveBeenCalled();
    });

    it('returns a non-fresh session without extending when 15+ days remain', async () => {
      const stored = buildSession({ expiresAt: new Date(TEST_NOW.getTime() + FIFTEEN_DAYS_MS) });
      sessionsRepository.get.mockResolvedValueOnce(stored);

      await expect(createService().validateSession(stored.id)).resolves.toEqual({ ...stored, fresh: false });
      expect(sessionsRepository.create).not.toHaveBeenCalled();
    });

    it('extends the session to 30 days when fewer than 15 days remain (boundary)', async () => {
      const stored = buildSession({ expiresAt: new Date(TEST_NOW.getTime() + FIFTEEN_DAYS_MS - 1) });
      sessionsRepository.get.mockResolvedValueOnce(stored);

      const result = await createService().validateSession(stored.id);

      expect(result).toMatchObject({ id: stored.id, userId: stored.userId, fresh: true });
      expect(result?.expiresAt.getTime()).toBe(TEST_NOW.getTime() + THIRTY_DAYS_MS);
      expect(sessionsRepository.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: stored.id }));
    });

    it('rejects an already-expired session and deletes the stale Redis entry', async () => {
      const stored = buildSession({ expiresAt: new Date(TEST_NOW.getTime() - 1000) });
      sessionsRepository.get.mockResolvedValueOnce(stored);

      await expect(createService().validateSession(stored.id)).resolves.toBeNull();
      expect(sessionsRepository.delete).toHaveBeenCalledExactlyOnceWith(stored.id);
      expect(sessionsRepository.create).not.toHaveBeenCalled();
    });

    it('propagates storage failures', async () => {
      sessionsRepository.get.mockRejectedValueOnce(new Error('redis unavailable'));

      await expect(createService().validateSession('any')).rejects.toThrow('redis unavailable');
    });
  });

  describe('invalidateSession', () => {
    it('deletes the session', async () => {
      await createService().invalidateSession('session-id');

      expect(sessionsRepository.delete).toHaveBeenCalledExactlyOnceWith('session-id');
    });

    it('propagates storage failures', async () => {
      sessionsRepository.delete.mockRejectedValueOnce(new Error('redis unavailable'));

      await expect(createService().invalidateSession('session-id')).rejects.toThrow('redis unavailable');
    });
  });

  describe('session cookie', () => {
    async function issueCookie(service: SessionsService, session = { ...buildSession(), fresh: true }) {
      const response = await runInHonoContext(async (c) => {
        requestContext.getContext.mockReturnValue(c);
        await service.setSessionCookie(session);
      });
      return response.headers.get('set-cookie') ?? '';
    }

    it('sets a signed, http-only, lax cookie that is not secure outside prod', async () => {
      const setCookie = await issueCookie(createService());

      expect(setCookie).toMatch(/^session=session_test_0001\.[^;]+;/);
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Lax');
      expect(setCookie).toContain('Path=/');
      expect(setCookie).not.toContain('Secure');
    });

    it('marks the cookie secure in prod', async () => {
      config = createConfigServiceMock({ ENV: 'prod' });

      await expect(issueCookie(createService())).resolves.toContain('Secure');
    });

    it('reads back a cookie it signed', async () => {
      const service = createService();
      const cookie = (await issueCookie(service)).split(';')[0];
      let value: string | null = 'unset';

      await runInHonoContext(
        async (c) => {
          requestContext.getContext.mockReturnValue(c);
          value = await service.getSessionCookie();
        },
        { headers: { cookie } },
      );

      expect(value).toBe('session_test_0001');
    });

    it('returns null when no session cookie is present', async () => {
      let value: string | null = 'unset';

      await runInHonoContext(async (c) => {
        requestContext.getContext.mockReturnValue(c);
        value = await createService().getSessionCookie();
      });

      expect(value).toBeNull();
    });

    it('returns null for a cookie signed with a different secret', async () => {
      config = createConfigServiceMock({ SIGNING_SECRET: 'other-secret' });
      const cookie = (await issueCookie(createService())).split(';')[0];
      config = createConfigServiceMock();
      const service = createService();
      let value: string | null = 'unset';

      await runInHonoContext(
        async (c) => {
          requestContext.getContext.mockReturnValue(c);
          value = await service.getSessionCookie();
        },
        { headers: { cookie } },
      );

      expect(value).toBeNull();
    });

    it('returns null for a tampered cookie value', async () => {
      const service = createService();
      const cookie = (await issueCookie(service)).split(';')[0].replace('session_test_0001', 'session_test_9999');
      let value: string | null = 'unset';

      await runInHonoContext(
        async (c) => {
          requestContext.getContext.mockReturnValue(c);
          value = await service.getSessionCookie();
        },
        { headers: { cookie } },
      );

      expect(value).toBeNull();
    });

    it('expires the cookie on delete', async () => {
      const service = createService();
      const response = await runInHonoContext((c) => {
        requestContext.getContext.mockReturnValue(c);
        service.deleteSessionCookie();
      });

      expect(response.headers.get('set-cookie')).toMatch(/^session=;.*Max-Age=0/);
    });
  });
});
