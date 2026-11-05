import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '#lib/server/api/common/configs/config.service';
import type { LoggerService } from '#lib/server/api/common/services/logger.service';
import type { EmailTemplate } from '#lib/server/api/mail/interfaces/email-template.interface';
import { UseSendMailerService } from '#lib/server/api/mail/usesend-mailer.service';
import { createConfigServiceMock } from '../../../../../test/mocks/config.mock';
import { createLoggerServiceMock } from '../../../../../test/mocks/logger.mock';

const fake = vi.hoisted(() => ({ send: vi.fn(), construct: vi.fn() }));

vi.mock('usesend-js', () => ({
  UseSend: class {
    emails = { send: fake.send };
    constructor(key: string, url?: string) {
      fake.construct(key, url);
    }
  },
}));

const SENT = { data: { emailId: 'email-1' }, error: null };
/** What `emails.send()` resolves to when the API refuses: useSend's standard body, nested as the library passes it on. */
const REFUSED = { data: null, error: { error: { code: 'FORBIDDEN', message: 'Invalid API token' } } };

const BODY_HTML = '<p>secret-html-body</p>';
const BODY_TEXT = 'secret-text-body';
const API_KEY = 'us_secret_key';
const template: EmailTemplate = { subject: () => 'Welcome', html: () => BODY_HTML, text: () => BODY_TEXT };

function buildService(envs: Parameters<typeof createConfigServiceMock>[0] = {}) {
  const logger = createLoggerServiceMock();
  const config = createConfigServiceMock({ USESEND_API_KEY: API_KEY, MAIL_FROM: 'noreply@example.com', ...envs });
  const service = new UseSendMailerService(config as unknown as ConfigService, logger as unknown as LoggerService);
  return { service, logger };
}

/** Runs a send to completion through every backoff; resolves with how it settled. */
async function settle(send: Promise<void>) {
  const settled = send.then(
    () => ({ rejected: undefined }),
    (rejected: unknown) => ({ rejected }),
  );
  await vi.runAllTimersAsync();
  return settled;
}

const idempotencyKeys = () => fake.send.mock.calls.map(([, options]) => options.idempotencyKey as string);

beforeEach(() => {
  vi.useFakeTimers();
  fake.send.mockReset().mockResolvedValue(SENT);
  fake.construct.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('UseSendMailerService sending', () => {
  it('sends one email per recipient with from, to, subject, html and text', async () => {
    const { service } = buildService();

    await service.send({ to: ['a@example.com', 'b@example.com'], template });

    expect(fake.send.mock.calls.map(([payload]) => payload)).toEqual([
      { from: 'noreply@example.com', to: 'a@example.com', subject: 'Welcome', html: BODY_HTML, text: BODY_TEXT },
      { from: 'noreply@example.com', to: 'b@example.com', subject: 'Welcome', html: BODY_HTML, text: BODY_TEXT },
    ]);
  });

  it('accepts a single recipient given as a string', async () => {
    const { service } = buildService();

    await service.send({ to: 'a@example.com', template });

    expect(fake.send).toHaveBeenCalledTimes(1);
    expect(fake.send.mock.calls[0][0].to).toBe('a@example.com');
  });

  it('makes no call and warns for an empty recipient list', async () => {
    const { service, logger } = buildService();

    await service.send({ to: [], template });

    expect(fake.send).not.toHaveBeenCalled();
    expect(fake.construct).not.toHaveBeenCalled();
    expect(logger.log.warn).toHaveBeenCalledTimes(1);
  });
});

describe('UseSendMailerService client', () => {
  it('creates the client on first send, not before, and only once', async () => {
    const { service } = buildService({ USESEND_BASE_URL: 'https://mail.example.com' });
    expect(fake.construct).not.toHaveBeenCalled();

    await service.send({ to: 'a@example.com', template });
    await service.send({ to: 'b@example.com', template });

    expect(fake.construct).toHaveBeenCalledTimes(1);
    expect(fake.construct).toHaveBeenCalledWith(API_KEY, 'https://mail.example.com');
  });

  it('leaves the base url to the library when unset', async () => {
    const { service } = buildService();

    await service.send({ to: 'a@example.com', template });

    expect(fake.construct).toHaveBeenCalledWith(API_KEY, undefined);
  });
});

describe('UseSendMailerService retries', () => {
  it('retries a send that resolves with an error twice, then resolves', async () => {
    fake.send.mockResolvedValueOnce(REFUSED).mockResolvedValueOnce(REFUSED);
    const { service } = buildService();

    const { rejected } = await settle(service.send({ to: 'a@example.com', template }));

    expect(rejected).toBeUndefined();
    expect(fake.send).toHaveBeenCalledTimes(3);
  });

  it('retries a send that throws twice, then resolves', async () => {
    fake.send.mockRejectedValueOnce(new Error('fetch failed')).mockRejectedValueOnce(new Error('fetch failed'));
    const { service } = buildService();

    const { rejected } = await settle(service.send({ to: 'a@example.com', template }));

    expect(rejected).toBeUndefined();
    expect(fake.send).toHaveBeenCalledTimes(3);
  });

  it('treats a flat error as a failure too', async () => {
    fake.send.mockResolvedValueOnce({ data: null, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Bad Gateway' } });
    const { service } = buildService();

    await settle(service.send({ to: 'a@example.com', template }));

    expect(fake.send).toHaveBeenCalledTimes(2);
  });

  it('rejects after exactly 3 calls when every send resolves with an error', async () => {
    fake.send.mockResolvedValue(REFUSED);
    const { service } = buildService();

    const { rejected } = await settle(service.send({ to: 'a@example.com', template }));

    expect(rejected).toBeInstanceOf(Error);
    expect((rejected as Error).message).toContain('FORBIDDEN');
    expect(fake.send).toHaveBeenCalledTimes(3);
  });

  it('re-throws the last thrown error after exactly 3 calls', async () => {
    const last = new Error('fetch failed: third');
    fake.send.mockRejectedValueOnce(new Error('first')).mockRejectedValueOnce(new Error('second')).mockRejectedValueOnce(last);
    const { service } = buildService();

    const { rejected } = await settle(service.send({ to: 'a@example.com', template }));

    expect(rejected).toBe(last);
    expect(fake.send).toHaveBeenCalledTimes(3);
  });

  it('backs off 250 ms, then 500 ms', async () => {
    fake.send.mockResolvedValueOnce(REFUSED).mockResolvedValueOnce(REFUSED);
    const { service } = buildService();

    const sending = service.send({ to: 'a@example.com', template });

    await vi.advanceTimersByTimeAsync(249);
    expect(fake.send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fake.send).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(499);
    expect(fake.send).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fake.send).toHaveBeenCalledTimes(3);
    await sending;
  });

  it('does not wait after the last failure', async () => {
    fake.send.mockResolvedValue(REFUSED);
    const { service } = buildService();
    const startedAt = Date.now();

    await settle(service.send({ to: 'a@example.com', template }));

    expect(vi.getTimerCount()).toBe(0);
    expect(Date.now() - startedAt).toBe(750);
  });
});

describe('UseSendMailerService idempotency keys', () => {
  it('uses the same key on every attempt for one message', async () => {
    fake.send.mockResolvedValueOnce(REFUSED).mockRejectedValueOnce(new Error('fetch failed'));
    const { service } = buildService();

    await settle(service.send({ to: 'a@example.com', template }));

    const keys = idempotencyKeys();
    expect(keys).toHaveLength(3);
    expect(keys[0]).toBeTruthy();
    expect(new Set(keys).size).toBe(1);
  });

  it('gives different recipients different keys', async () => {
    const { service } = buildService();

    await service.send({ to: ['a@example.com', 'b@example.com'], template });

    const [first, second] = idempotencyKeys();
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(first).not.toBe(second);
  });

  it('gives a new message to the same recipient a new key', async () => {
    const { service } = buildService();

    await service.send({ to: 'a@example.com', template });
    await service.send({ to: 'a@example.com', template });

    const [first, second] = idempotencyKeys();
    expect(first).not.toBe(second);
  });
});

describe('UseSendMailerService logs', () => {
  const entries = (logger: ReturnType<typeof createLoggerServiceMock>) =>
    [...logger.log.info.mock.calls, ...logger.log.warn.mock.calls, ...logger.log.error.mock.calls].map(([fields]) => fields);

  it('writes one entry per attempt with recipient, attempt and error code', async () => {
    fake.send.mockResolvedValueOnce(REFUSED).mockRejectedValueOnce(new Error('fetch failed'));
    const { service, logger } = buildService();

    await settle(service.send({ to: 'a@example.com', template }));

    expect(logger.log.warn.mock.calls.map(([fields]) => fields)).toEqual([
      { to: 'a@example.com', attempt: 1, error: 'FORBIDDEN: Invalid API token' },
      { to: 'a@example.com', attempt: 2, error: 'fetch failed' },
    ]);
    expect(logger.log.info.mock.calls.map(([fields]) => fields)).toEqual([{ to: 'a@example.com', attempt: 3 }]);
  });

  it.each([
    ['a flat error', { code: 'INTERNAL_SERVER_ERROR', message: 'Bad Gateway' }, 'INTERNAL_SERVER_ERROR: Bad Gateway'],
    ['a nested message without a code', { error: { message: 'nope' } }, 'nope'],
    ['a message without a code', { message: 'nope' }, 'nope'],
    ['a bare string', 'Rate limited', 'Rate limited'],
    ['an unreadable shape', { status: 500 }, 'unknown useSend error'],
  ])('reads %s', async (_name, error, expected) => {
    fake.send.mockResolvedValueOnce({ data: null, error });
    const { service, logger } = buildService();

    await settle(service.send({ to: 'a@example.com', template }));

    expect(logger.log.warn.mock.calls[0][0].error).toBe(expected);
  });

  it('never logs the email body or the API key', async () => {
    fake.send.mockResolvedValueOnce(REFUSED);
    const { service, logger } = buildService();

    await settle(service.send({ to: 'a@example.com', template }));

    const logged = JSON.stringify([logger.log.info.mock.calls, logger.log.warn.mock.calls, logger.log.error.mock.calls]);
    expect(logged).not.toContain(BODY_HTML);
    expect(logged).not.toContain(BODY_TEXT);
    expect(logged).not.toContain(API_KEY);
    expect(entries(logger)).toHaveLength(2);
  });
});
