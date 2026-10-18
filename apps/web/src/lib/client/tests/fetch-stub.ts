import { AUTH_BASE_PATH, type CaptchaPublicConfig, CONTENT_TYPE_HEADER, JSON_CONTENT_TYPE, StatusCodes } from '@adelie/shared';
import { vi } from 'vitest';
import { CAPTCHA_CONFIG_PATH, clearCaptchaConfigCache } from '#lib/client/captcha/config.ts';

/** A request as it reached the network, after the web auth client's custom fetch ran. */
export interface SentRequest {
  path: string;
  method: string;
  headers: Headers;
  body: unknown;
}

export interface StubReply {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

/** The pathname the web auth client requests for a Better Auth endpoint such as `/sign-in/email`. */
export const authPath = (endpoint: string) => `${AUTH_BASE_PATH}${endpoint}`;

/**
 * Replaces global fetch for page and dialog tests that run the real web auth client, so its custom fetch (and the
 * captcha binding guard in it) runs too. Unstubbed paths answer 200 `{}`; captcha config answers disabled until
 * {@link captcha} says otherwise. Undo with `vi.unstubAllGlobals()`.
 */
export function stubFetch() {
  const replies = new Map<string, StubReply>();
  const requests: SentRequest[] = [];
  clearCaptchaConfigCache();

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input instanceof Request ? input : new URL(String(input), window.location.origin), init);
      const path = new URL(request.url).pathname;
      const text = await request.text();
      requests.push({ path, method: request.method, headers: request.headers, body: text ? JSON.parse(text) : undefined });
      const reply = replies.get(path) ?? (path === CAPTCHA_CONFIG_PATH ? { body: { enabled: false } } : {});
      return new Response(JSON.stringify(reply.body ?? {}), {
        status: reply.status ?? StatusCodes.OK,
        headers: { [CONTENT_TYPE_HEADER]: JSON_CONTENT_TYPE, ...reply.headers },
      });
    }),
  );

  return {
    /** Answers every later request to `path` with `reply`. */
    reply(path: string, reply: StubReply) {
      replies.set(path, reply);
    },
    /** Reports captcha config as the public config endpoint would. */
    captcha(config: CaptchaPublicConfig) {
      replies.set(CAPTCHA_CONFIG_PATH, { body: config });
    },
    /** The requests sent to `path`, oldest first. */
    sent(path: string) {
      return requests.filter((request) => request.path === path);
    },
  };
}
