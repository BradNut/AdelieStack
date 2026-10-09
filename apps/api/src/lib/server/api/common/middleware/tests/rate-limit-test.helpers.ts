import { expect, vi } from 'vitest';
import { rateLimitTestMocks } from './rate-limit-test.mocks';

export async function expectRateLimitBypassed(createMiddleware: () => (c: never, next: () => Promise<void>) => Promise<unknown>): Promise<void> {
  rateLimitTestMocks.disableRateLimitMock.value = true;
  const middleware = createMiddleware();
  const next = vi.fn();
  await middleware({} as never, next);
  expect(next).toHaveBeenCalledTimes(1);
  expect(rateLimitTestMocks.rateLimiterMock).not.toHaveBeenCalled();
}

type NoSessionOptions = {
  keyGenerator: (ctx: { var: { session: null }; req: { path: string } }) => string;
};

export function getNoSessionRateLimitOptions(createMiddleware: () => unknown): NoSessionOptions {
  createMiddleware();
  return rateLimitTestMocks.rateLimiterMock.mock.calls[0][0] as NoSessionOptions;
}
