import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '#lib/server/api/common/configs/config.service';
import { envsDto } from '#lib/server/api/common/configs/dtos/env.dto';
import { DevMailerService } from '#lib/server/api/mail/dev-mailer.service';
import type { EmailTemplate } from '#lib/server/api/mail/interfaces/email-template.interface';
import { MailerService } from '#lib/server/api/mail/mailer.service';
import { MailerTransport, type MailerTransportType } from '#lib/server/api/mail/mailer-transport.constant';
import type { UseSendMailerService } from '#lib/server/api/mail/usesend-mailer.service';

const template: EmailTemplate = {
  subject: () => 'Welcome',
  html: () => '<p>Hello penguin</p>',
  text: () => 'Hello penguin',
};

const PENGUIN = { email: 'penguin@example.com', userId: 'user-penguin' };

/** Every variable the env DTO requires, and no `MAILER_TRANSPORT`. */
const ENV_WITHOUT_TRANSPORT = {
  DATABASE_USER: 'postgres',
  DATABASE_PASSWORD: 'postgres',
  DATABASE_HOST: 'localhost',
  DATABASE_PORT: '5432',
  DATABASE_DB: 'postgres',
  ORIGIN: 'http://localhost:5173',
  DOMAIN: 'localhost',
  REDIS_URL: 'redis://localhost:6379',
  SIGNING_SECRET: 'test-signing-secret-at-least-32-chars',
  BETTER_AUTH_SECRET: 'better-auth-secret-at-least-32-chars',
  BETTER_AUTH_URL: 'http://localhost:5173',
  ENV: 'dev',
  PORT: '3001',
  STORAGE_HOST: 'localhost',
  STORAGE_PORT: '8333',
  STORAGE_ACCESS_KEY: 'user',
  STORAGE_SECRET_KEY: 'password',
  STORAGE_URL: 'http://localhost:8333',
  PUBLIC_IMAGE_URI: 'http://localhost:8333/adelie-public-development',
};

function buildMailerService(transport: MailerTransportType) {
  const configService = { envs: { MAILER_TRANSPORT: transport } } as unknown as ConfigService;
  const useSendMailer = { send: vi.fn() } as unknown as UseSendMailerService;
  const devMailer = { send: vi.fn() } as unknown as DevMailerService;
  const service = new MailerService(configService, useSendMailer, devMailer);
  return { service, useSendMailer, devMailer };
}

describe('MailerService transport selection', () => {
  it('routes to the dev (mailpit) transport by default', async () => {
    const { service, useSendMailer, devMailer } = buildMailerService(MailerTransport.MAILPIT);

    await service.send({ to: PENGUIN, template });

    expect(devMailer.send).toHaveBeenCalledWith({ to: PENGUIN, template });
    expect(useSendMailer.send).not.toHaveBeenCalled();
  });

  it('routes to the useSend transport when MAILER_TRANSPORT is unsend', async () => {
    const { service, useSendMailer, devMailer } = buildMailerService(MailerTransport.UNSEND);

    await service.send({ to: PENGUIN, template });

    expect(useSendMailer.send).toHaveBeenCalledWith({ to: PENGUIN, template });
    expect(devMailer.send).not.toHaveBeenCalled();
  });

  it('routes to the dev transport when MAILER_TRANSPORT is unset, through the env DTO', async () => {
    const envs = envsDto.parse(ENV_WITHOUT_TRANSPORT);
    const useSendMailer = { send: vi.fn() } as unknown as UseSendMailerService;
    const devMailer = { send: vi.fn() } as unknown as DevMailerService;
    const service = new MailerService({ envs } as ConfigService, useSendMailer, devMailer);

    await service.send({ to: PENGUIN, template });

    expect(devMailer.send).toHaveBeenCalledWith({ to: PENGUIN, template });
    expect(useSendMailer.send).not.toHaveBeenCalled();
  });
});

describe('DevMailerService send', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ID: 'msg-1' }) });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('posts the rendered template to the mailpit inbox', async () => {
    await new DevMailerService().send({ to: PENGUIN, template });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8025/api/v1/send');
    expect(options.method).toBe('POST');

    const body = JSON.parse(options.body);
    expect(body.Subject).toBe('Welcome');
    expect(body.HTML).toBe('<p>Hello penguin</p>');
    expect(body.Text).toBe('Hello penguin');
    expect(body.To).toEqual([{ Email: 'penguin@example.com', Name: 'penguin@example.com' }]);
  });

  it('addresses every recipient of a list, with nothing but their email', async () => {
    await new DevMailerService().send({ to: [PENGUIN, { email: 'invitee@example.com', userId: null }], template });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).To).toEqual([
      { Email: 'penguin@example.com', Name: 'penguin@example.com' },
      { Email: 'invitee@example.com', Name: 'invitee@example.com' },
    ]);
  });
});
