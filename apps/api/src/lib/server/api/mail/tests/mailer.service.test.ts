import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '../../common/configs/config.service';
import { DevMailerService } from '../dev-mailer.service';
import type { EmailTemplate } from '../interfaces/email-template.interface';
import { MailerTransport, type MailerTransportType } from '../mailer-transport.constant';
import { MailerService } from '../mailer.service';
import type { ProdMailerService } from '../prod-mailer.service';

const template: EmailTemplate = {
  subject: () => 'Welcome',
  html: () => '<p>Hello penguin</p>',
};

function buildMailerService(transport: MailerTransportType) {
  const configService = { envs: { MAILER_TRANSPORT: transport } } as unknown as ConfigService;
  const prodMailer = { send: vi.fn() } as unknown as ProdMailerService;
  const devMailer = { send: vi.fn() } as unknown as DevMailerService;
  const service = new MailerService(configService, prodMailer, devMailer);
  return { service, prodMailer, devMailer };
}

describe('MailerService transport selection', () => {
  it('routes to the dev (mailpit) transport by default', async () => {
    const { service, prodMailer, devMailer } = buildMailerService(MailerTransport.MAILPIT);

    await service.send({ to: 'penguin@example.com', template });

    expect(devMailer.send).toHaveBeenCalledWith({ to: 'penguin@example.com', template });
    expect(prodMailer.send).not.toHaveBeenCalled();
  });

  it('routes to the prod transport when MAILER_TRANSPORT is unsend', async () => {
    const { service, prodMailer, devMailer } = buildMailerService(MailerTransport.UNSEND);

    await service.send({ to: 'penguin@example.com', template });

    expect(prodMailer.send).toHaveBeenCalledWith({ to: 'penguin@example.com', template });
    expect(devMailer.send).not.toHaveBeenCalled();
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
    await new DevMailerService().send({ to: 'penguin@example.com', template });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8025/api/v1/send');
    expect(options.method).toBe('POST');

    const body = JSON.parse(options.body);
    expect(body.Subject).toBe('Welcome');
    expect(body.HTML).toBe('<p>Hello penguin</p>');
    expect(body.To).toEqual([{ Email: 'penguin@example.com', Name: 'penguin@example.com' }]);
  });
});
