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

type NoSessionContext = { var: { session: null }; req: { path: string } };

type RateLimitOptions<TContext> = {
  keyGenerator: (ctx: TContext) => string;
};

/** Options of the limiter `createMiddleware` just created. */
export function getRateLimitOptions<TContext = NoSessionContext>(createMiddleware: () => unknown): RateLimitOptions<TContext> {
  createMiddleware();
  return rateLimitTestMocks.rateLimiterMock.mock.lastCall?.[0] as RateLimitOptions<TContext>;
}
