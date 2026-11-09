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
class WelcomeEmail implements EmailTemplate {
  subject = () => 'Welcome';
  html = () => BODY_HTML;
  text = () => BODY_TEXT;
}
const template = new WelcomeEmail();
const A = { email: 'a@example.com', userId: 'user-a' };
const B = { email: 'b@example.com', userId: 'user-b' };
const C = { email: 'c@example.com', userId: 'user-c' };

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

    await service.send({ to: [A, B], template });

    expect(fake.send.mock.calls.map(([payload]) => payload)).toEqual([
      { from: 'noreply@example.com', to: 'a@example.com', subject: 'Welcome', html: BODY_HTML, text: BODY_TEXT },
      { from: 'noreply@example.com', to: 'b@example.com', subject: 'Welcome', html: BODY_HTML, text: BODY_TEXT },
    ]);
  });

  it('accepts a single recipient that is not in a list', async () => {
    const { service } = buildService();

    await service.send({ to: A, template });

    expect(fake.send).toHaveBeenCalledTimes(1);
    expect(fake.send.mock.calls[0][0].to).toBe('a@example.com');
  });

  it('still tries the later recipients after one exhausts its attempts, then re-throws', async () => {
    const failure = new Error('fetch failed');
    fake.send.mockImplementation(async ({ to }) => {
      if (to === 'a@example.com') throw failure;
      return SENT;
    });
    const { service } = buildService();

    const { rejected } = await settle(service.send({ to: [A, B, C], template }));

    expect(fake.send.mock.calls.map(([payload]) => payload.to)).toEqual([
      'a@example.com',
      'a@example.com',
      'a@example.com',
      'b@example.com',
      'c@example.com',
    ]);
    expect(rejected).toBe(failure);
  });

  it('re-throws the first failure when several recipients fail', async () => {
    fake.send.mockImplementation(async ({ to }) => {
      throw new Error(`failed for ${to}`);
    });
    const { service } = buildService();

    const { rejected } = await settle(service.send({ to: [A, B], template }));

    expect(fake.send).toHaveBeenCalledTimes(6);
    expect((rejected as Error).message).toBe('failed for a@example.com');
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

    await service.send({ to: A, template });
    await service.send({ to: B, template });

    expect(fake.construct).toHaveBeenCalledTimes(1);
    expect(fake.construct).toHaveBeenCalledWith(API_KEY, 'https://mail.example.com');
  });

  it('hands the client the hosted useSend address when the base url is unset', async () => {
    const { service } = buildService();

    await service.send({ to: A, template });

    expect(fake.construct).toHaveBeenCalledWith(API_KEY, 'https://app.usesend.com');
  });
});

describe('UseSendMailerService retries', () => {
  it('retries a send that resolves with an error twice, then resolves', async () => {
    fake.send.mockResolvedValueOnce(REFUSED).mockResolvedValueOnce(REFUSED);
    const { service } = buildService();

    const { rejected } = await settle(service.send({ to: A, template }));

    expect(rejected).toBeUndefined();
    expect(fake.send).toHaveBeenCalledTimes(3);
  });

  it('retries a send that throws twice, then resolves', async () => {
    fake.send.mockRejectedValueOnce(new Error('fetch failed')).mockRejectedValueOnce(new Error('fetch failed'));
    const { service } = buildService();

    const { rejected } = await settle(service.send({ to: A, template }));

    expect(rejected).toBeUndefined();
    expect(fake.send).toHaveBeenCalledTimes(3);
  });

  it('treats a flat error as a failure too', async () => {
    fake.send.mockResolvedValueOnce({ data: null, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Bad Gateway' } });
    const { service } = buildService();

    await settle(service.send({ to: A, template }));

    expect(fake.send).toHaveBeenCalledTimes(2);
  });

  it('rejects after exactly 3 calls when every send resolves with an error', async () => {
    fake.send.mockResolvedValue(REFUSED);
    const { service } = buildService();

    const { rejected } = await settle(service.send({ to: A, template }));

    expect(rejected).toBeInstanceOf(Error);
    expect((rejected as Error).message).toContain('FORBIDDEN');
    expect(fake.send).toHaveBeenCalledTimes(3);
  });

  it('re-throws the last thrown error after exactly 3 calls', async () => {
    const last = new Error('fetch failed: third');
    fake.send.mockRejectedValueOnce(new Error('first')).mockRejectedValueOnce(new Error('second')).mockRejectedValueOnce(last);
    const { service } = buildService();

    const { rejected } = await settle(service.send({ to: A, template }));

    expect(rejected).toBe(last);
    expect(fake.send).toHaveBeenCalledTimes(3);
  });

  it('backs off 250 ms, then 500 ms', async () => {
    fake.send.mockResolvedValueOnce(REFUSED).mockResolvedValueOnce(REFUSED);
    const { service } = buildService();

    const sending = service.send({ to: A, template });

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

    await settle(service.send({ to: A, template }));

    expect(vi.getTimerCount()).toBe(0);
    expect(Date.now() - startedAt).toBe(750);
  });
});

describe('UseSendMailerService idempotency keys', () => {
  it('uses the same key on every attempt for one message', async () => {
    fake.send.mockResolvedValueOnce(REFUSED).mockRejectedValueOnce(new Error('fetch failed'));
    const { service } = buildService();

    await settle(service.send({ to: A, template }));

    const keys = idempotencyKeys();
    expect(keys).toHaveLength(3);
    expect(keys[0]).toBeTruthy();
    expect(new Set(keys).size).toBe(1);
  });

  it('gives different recipients different keys', async () => {
    const { service } = buildService();

    await service.send({ to: [A, B], template });

    const [first, second] = idempotencyKeys();
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(first).not.toBe(second);
  });

  it('gives a new message to the same recipient a new key', async () => {
    const { service } = buildService();

    await service.send({ to: A, template });
    await service.send({ to: A, template });

    const [first, second] = idempotencyKeys();
    expect(first).not.toBe(second);
  });
});

describe('UseSendMailerService logs', () => {
  const entries = (logger: ReturnType<typeof createLoggerServiceMock>) =>
    [...logger.log.info.mock.calls, ...logger.log.warn.mock.calls, ...logger.log.error.mock.calls].map(([fields]) => fields);

  it('writes one entry per attempt with the user, template, attempt and error code', async () => {
    fake.send.mockResolvedValueOnce(REFUSED).mockRejectedValueOnce(new Error('fetch failed'));
    const { service, logger } = buildService();

    await settle(service.send({ to: A, template }));

    expect(logger.log.warn.mock.calls.map(([fields]) => fields)).toEqual([
      { userId: 'user-a', template: 'WelcomeEmail', attempt: 1, error: 'FORBIDDEN: Invalid API token' },
      { userId: 'user-a', template: 'WelcomeEmail', attempt: 2, error: 'fetch failed' },
    ]);
    expect(logger.log.info.mock.calls.map(([fields]) => fields)).toEqual([{ userId: 'user-a', template: 'WelcomeEmail', attempt: 3 }]);
  });

  it('gives each recipient their own user ID', async () => {
    fake.send.mockImplementation(async ({ to }) => {
      if (to === A.email) throw new Error('fetch failed');
      return SENT;
    });
    const { service, logger } = buildService();

    await settle(service.send({ to: [A, B], template }));

    expect(logger.log.warn.mock.calls.map(([fields]) => fields.userId)).toEqual(['user-a', 'user-a', 'user-a']);
    expect(logger.log.info.mock.calls.map(([fields]) => fields.userId)).toEqual(['user-b']);
  });

  it('logs a recipient with no account as a null user ID', async () => {
    const { service, logger } = buildService();

    await service.send({ to: { email: 'invitee@example.com', userId: null }, template });

    expect(logger.log.info.mock.calls[0][0]).toEqual({ userId: null, template: 'WelcomeEmail', attempt: 1 });
    expect(fake.send.mock.calls[0][0].to).toBe('invitee@example.com');
  });

  it('never logs the address of a send that succeeds or fails', async () => {
    fake.send.mockResolvedValueOnce(REFUSED).mockRejectedValueOnce(new Error('fetch failed'));
    const { service, logger } = buildService();

    await settle(service.send({ to: A, template }));

    expect(entries(logger)).toHaveLength(3);
    expect(JSON.stringify(entries(logger))).not.toContain(A.email);
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

    await settle(service.send({ to: A, template }));

    expect(logger.log.warn.mock.calls[0][0].error).toBe(expected);
  });

  describe('error text that quotes an address', () => {
    const refusedWith = (message: string) => ({ data: null, error: { error: { code: 'VALIDATION', message } } });
    const warned = (logger: ReturnType<typeof createLoggerServiceMock>) => logger.log.warn.mock.calls[0][0].error;

    it.each([
      ['as given', 'Cannot send to a@example.com today', 'VALIDATION: Cannot send to [email] today'],
      ['in another case', 'Cannot send to A@Example.COM today', 'VALIDATION: Cannot send to [email] today'],
      ['in angle brackets', 'Rejected <a@example.com>', 'VALIDATION: Rejected <[email]>'],
      ['URL-encoded', 'POST /suppress/a%40example.com failed', 'VALIDATION: POST /suppress/[email] failed'],
      ['with an apostrophe', "Bounced o'brien@example.com", 'VALIDATION: Bounced [email]'],
      ['among others', 'a@example.com and other@corp.example.org', 'VALIDATION: [email] and [email]'],
    ])('masks it %s in the log entry', async (_name, message, expected) => {
      fake.send.mockResolvedValueOnce(refusedWith(message));
      const { service, logger } = buildService();

      await settle(service.send({ to: A, template }));

      expect(warned(logger)).toBe(expected);
    });

    it('masks an address in an error the library throws', async () => {
      fake.send.mockRejectedValueOnce(new Error('connect failed for a@example.com'));
      const { service, logger } = buildService();

      await settle(service.send({ to: A, template }));

      expect(warned(logger)).toBe('connect failed for [email]');
    });

    it('masks a thrown value that is not an Error', async () => {
      fake.send.mockRejectedValueOnce('refused a@example.com');
      const { service, logger } = buildService();

      await settle(service.send({ to: A, template }));

      expect(warned(logger)).toBe('refused [email]');
    });

    it('leaves text with no address alone', async () => {
      fake.send.mockResolvedValueOnce(REFUSED);
      const { service, logger } = buildService();

      await settle(service.send({ to: A, template }));

      expect(warned(logger)).toBe('FORBIDDEN: Invalid API token');
    });

    it('masks the error handed to the caller when every attempt is refused', async () => {
      fake.send.mockResolvedValue(refusedWith('Cannot send to a@example.com'));
      const { service } = buildService();

      const { rejected } = await settle(service.send({ to: A, template }));

      expect((rejected as Error).message).toBe('VALIDATION: Cannot send to [email]');
    });
  });

  it('never logs the email body or the API key', async () => {
    fake.send.mockResolvedValueOnce(REFUSED);
    const { service, logger } = buildService();

    await settle(service.send({ to: A, template }));

    const logged = JSON.stringify([logger.log.info.mock.calls, logger.log.warn.mock.calls, logger.log.error.mock.calls]);
    expect(logged).not.toContain(BODY_HTML);
    expect(logged).not.toContain(BODY_TEXT);
    expect(logged).not.toContain(API_KEY);
    expect(entries(logger)).toHaveLength(2);
  });
});
