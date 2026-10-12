import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CAPTCHA_CONFIG_PATH, clearCaptchaConfigCache, getCaptchaConfig } from '../config';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  clearCaptchaConfigCache();
});

describe('getCaptchaConfig', () => {
  it('reads the public config from the API', async () => {
    const fetcher = vi.fn(async () => json({ enabled: true, provider: 'hcaptcha', siteKey: 'site' }));

    expect(await getCaptchaConfig(fetcher)).toEqual({ enabled: true, provider: 'hcaptcha', siteKey: 'site' });
    expect(fetcher).toHaveBeenCalledWith(CAPTCHA_CONFIG_PATH);
  });

  it('asks once and reuses the answer', async () => {
    const fetcher = vi.fn(async () => json({ enabled: false }));

    await getCaptchaConfig(fetcher);
    await getCaptchaConfig(fetcher);

    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('does not cache a failure, so a later form can retry', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({}, 500))
      .mockResolvedValueOnce(json({ enabled: false }));

    await expect(getCaptchaConfig(fetcher)).rejects.toThrow();
    expect(await getCaptchaConfig(fetcher)).toEqual({ enabled: false });
  });
});
