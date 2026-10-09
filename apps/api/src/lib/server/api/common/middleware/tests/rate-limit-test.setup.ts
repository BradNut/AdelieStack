import { vi } from 'vitest';

vi.mock('@needle-di/core', async (original) => (await import('./rate-limit-test.mocks')).rateLimitTestMocks.createNeedleDiMock(original));
vi.mock('hono-rate-limiter', async () => (await import('./rate-limit-test.mocks')).rateLimitTestMocks.createHonoRateLimiterMock());
