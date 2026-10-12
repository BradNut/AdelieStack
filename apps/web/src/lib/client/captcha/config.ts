import type { CaptchaPublicConfig } from '@adelie/shared';

/** Public API route (proxied on the web origin) that reports whether captcha is on, and which provider and site key. */
export const CAPTCHA_CONFIG_PATH = '/api/config/captcha';

let cached: Promise<CaptchaPublicConfig> | null = null;

/** Reads the captcha settings once per page load; a failed read is not cached, so the next form retries. */
export function getCaptchaConfig(fetcher: (path: string) => Promise<Response> = (path) => fetch(path)): Promise<CaptchaPublicConfig> {
  cached ??= fetcher(CAPTCHA_CONFIG_PATH)
    .then((response) => {
      if (!response.ok) throw new Error(`Could not read captcha config: ${response.status}`);
      return response.json() as Promise<CaptchaPublicConfig>;
    })
    .catch((error) => {
      cached = null;
      throw error;
    });
  return cached;
}

export function clearCaptchaConfigCache(): void {
  cached = null;
}
