import { defineConfig } from 'vitest/config';

/** Tests that need a real Redis (REDIS_URL). Run with `pnpm test:redis`; the default config leaves them out. */
export default defineConfig({
  test: {
    include: ['src/**/*.redis.test.ts'],
    environment: 'node',
    restoreMocks: true,
    unstubEnvs: true,
  },
});
