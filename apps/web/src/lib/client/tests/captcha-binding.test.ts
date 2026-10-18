import { AUTH_BASE_PATH, CAPTCHA_PROTECTED_PATHS, CAPTCHA_RESPONSE_HEADER, RETRY_AFTER_HEADER, StatusCodes } from '@adelie/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAPTCHA_CONFIG_PATH } from '#lib/client/captcha/config.ts';
import { CAPTCHA_BINDING_HEADER, CAPTCHA_BINDING_VALUE } from '#lib/constants/captcha.ts';
import { withCaptchaBinding } from '../captcha-binding';
import { withRetryAfter } from '../retry-after';

const ORIGIN = 'http://localhost:5173';
const BOUND = { [CAPTCHA_BINDING_HEADER]: CAPTCHA_BINDING_VALUE };

/** A base fetch that records the headers it was sent and answers 200. */
function guarded() {
  const base = vi.fn<typeof fetch>(async () => new Response('{}', { status: StatusCodes.OK }));
  return { base, fetch: withCaptchaBinding(base), sentHeaders: () => new Headers(base.mock.calls[0]?.[1]?.headers) };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('withCaptchaBinding', () => {
  describe.each(CAPTCHA_PROTECTED_PATHS)('protected path %s', (path) => {
    const url = `${ORIGIN}${AUTH_BASE_PATH}${path}`;

    it('throws in development when the request is not bound, naming the path and attempt', async () => {
      const { base, fetch } = guarded();

      await expect(fetch(url, { method: 'POST' })).rejects.toThrow(new RegExp(`${AUTH_BASE_PATH}${path}.*attempt`));
      expect(base).not.toHaveBeenCalled();
    });

    it('sends a bound request with the marker stripped and the Captcha Token kept', async () => {
      const { base, fetch, sentHeaders } = guarded();

      await fetch(url, { method: 'POST', headers: { ...BOUND, [CAPTCHA_RESPONSE_HEADER]: 'token' } });

      expect(base).toHaveBeenCalledOnce();
      expect(sentHeaders().has(CAPTCHA_BINDING_HEADER)).toBe(false);
      expect(sentHeaders().get(CAPTCHA_RESPONSE_HEADER)).toBe('token');
    });

    it('reads the marker from a Request input too', async () => {
      const { base, fetch } = guarded();

      await fetch(new Request(url, { method: 'POST', headers: BOUND }));

      const [input, init] = base.mock.calls[0] ?? [];
      expect(new Headers(init?.headers ?? (input as Request).headers).has(CAPTCHA_BINDING_HEADER)).toBe(false);
    });

    it('in production logs an unbound request and sends it unchanged', async () => {
      vi.stubEnv('DEV', false);
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { base, fetch } = guarded();
      const init = { method: 'POST', headers: { [CAPTCHA_RESPONSE_HEADER]: 'token' } };

      await fetch(url, init);

      expect(error).toHaveBeenCalledWith(expect.stringContaining(`${AUTH_BASE_PATH}${path}`));
      expect(base).toHaveBeenCalledWith(url, init);
    });
  });

  it.each([`${AUTH_BASE_PATH}/get-session`, `${AUTH_BASE_PATH}/sign-in/passkey`, `${AUTH_BASE_PATH}/sign-in/email/extra`, CAPTCHA_CONFIG_PATH])(
    'passes the unprotected path %s through untouched',
    async (path) => {
      const { base, fetch } = guarded();
      const init = { method: 'POST', headers: { 'x-other': '1' } };

      await fetch(`${ORIGIN}${path}`, init);

      expect(base).toHaveBeenCalledWith(`${ORIGIN}${path}`, init);
    },
  );

  it('matches a relative URL against the page origin', async () => {
    const { fetch } = guarded();

    await expect(fetch(`${AUTH_BASE_PATH}/sign-in/email`, { method: 'POST' })).rejects.toThrow(/attempt/);
  });

  it('composes with the retry-after wrapper, which still turns a 429 wait into the error body', async () => {
    const base = vi.fn<typeof fetch>(
      async () =>
        new Response('{"message":"Too many requests"}', {
          status: StatusCodes.TOO_MANY_REQUESTS,
          headers: { 'content-type': 'application/json', [RETRY_AFTER_HEADER]: '42' },
        }),
    );
    const fetch = withRetryAfter(withCaptchaBinding(base));

    const response = await fetch(`${ORIGIN}${AUTH_BASE_PATH}/sign-in/email`, { method: 'POST', headers: BOUND });

    expect(await response.json()).toEqual({ message: 'Too many requests', retryAfter: 42 });
    expect(new Headers(base.mock.calls[0]?.[1]?.headers).has(CAPTCHA_BINDING_HEADER)).toBe(false);
  });
});
