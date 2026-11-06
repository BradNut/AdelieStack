import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '#lib/server/api/common/configs/config.service';
import type { LoggerService } from '#lib/server/api/common/services/logger.service';
import type { EmailTemplate } from '#lib/server/api/mail/interfaces/email-template.interface';
import { UseSendMailerService } from '#lib/server/api/mail/usesend-mailer.service';
import { createConfigServiceMock } from '../../../../../test/mocks/config.mock';
import { createLoggerServiceMock } from '../../../../../test/mocks/logger.mock';

// The library reads this once, at import, and keeps an empty string as its address, so it is set ahead of the imports.
vi.hoisted(() => {
  process.env.USESEND_BASE_URL = '';
});

/**
 * Runs the real `usesend-js` over a stubbed `fetch`: what the service assumes about the library (the nested returned
 * error, the appended `/api/v1`, the idempotency header) fails here if an upgrade changes it.
 */
const template: EmailTemplate = { subject: () => 'Welcome', html: () => '<p>Hi</p>', text: () => 'Hi' };

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

function buildService(envs: Parameters<typeof createConfigServiceMock>[0] = {}) {
  const logger = createLoggerServiceMock();
  const config = createConfigServiceMock({ USESEND_API_KEY: 'us_key', MAIL_FROM: 'noreply@example.com', ...envs });
  return { service: new UseSendMailerService(config as unknown as ConfigService, logger as unknown as LoggerService), logger };
}

describe('UseSendMailerService over the real usesend-js', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function settle(send: Promise<void>) {
    const settled = send.then(
      () => undefined,
      (rejected: Error) => rejected,
    );
    await vi.runAllTimersAsync();
    return settled;
  }

  it('posts to the base url plus /api/v1, with the key and the idempotency key as headers', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { emailId: 'email-1' }));
    const { service } = buildService({ USESEND_BASE_URL: 'https://mail.example.com' });

    await service.send({ to: 'a@example.com', template });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://mail.example.com/api/v1/emails');
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer us_key');
    expect(headers.get('Idempotency-Key')).toBeTruthy();
    expect(JSON.parse(String(init?.body))).toEqual({
      from: 'noreply@example.com',
      to: 'a@example.com',
      subject: 'Welcome',
      html: '<p>Hi</p>',
      text: 'Hi',
    });
  });

  it('posts to the hosted useSend address when the variable is empty in process.env', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { emailId: 'email-1' }));
    // What the env DTO turns an empty value into.
    const { service } = buildService({ USESEND_BASE_URL: undefined });

    await service.send({ to: 'a@example.com', template });

    expect(fetchMock.mock.calls[0][0]).toBe('https://app.usesend.com/api/v1/emails');
  });

  it('treats a refusal in the standard error body as a failure and reads its nested code', async () => {
    fetchMock.mockImplementation(async () => json(403, { error: { code: 'FORBIDDEN', message: 'Invalid API token' } }));
    const { service, logger } = buildService();

    const rejected = await settle(service.send({ to: 'a@example.com', template }));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(rejected?.message).toBe('FORBIDDEN: Invalid API token');
    expect(logger.log.warn.mock.calls[0][0].error).toBe('FORBIDDEN: Invalid API token');
  });

  it('treats a non-JSON server error as a failure', async () => {
    fetchMock.mockImplementation(async () => new Response('<html>oops</html>', { status: 502, statusText: 'Bad Gateway' }));
    const { service } = buildService();

    const rejected = await settle(service.send({ to: 'a@example.com', template }));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(rejected?.message).toBe('INTERNAL_SERVER_ERROR: Bad Gateway');
  });

  it('sends the same idempotency key on every attempt', async () => {
    fetchMock.mockResolvedValueOnce(json(500, { error: { code: 'INTERNAL_SERVER_ERROR', message: 'boom' } }));
    fetchMock.mockResolvedValueOnce(json(200, { emailId: 'email-1' }));
    const { service } = buildService();

    await settle(service.send({ to: 'a@example.com', template }));

    const keys = fetchMock.mock.calls.map(([, init]) => new Headers(init?.headers).get('Idempotency-Key'));
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[0]).toBe(keys[1]);
  });
});
