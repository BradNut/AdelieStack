import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}'],
    // Real-Redis tests run through vitest.redis.config.ts (`pnpm test:redis`).
    exclude: [...configDefaults.exclude, 'src/**/*.redis.test.ts'],
    environment: 'node',
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    coverage: {
      include: ['src/**/*.{js,ts}'],
      exclude: ['**/*.{test,spec}.{js,ts}', 'src/test/**', '**/common/testing/**', '**/migrate.ts', '**/seed.ts', '**/seeds/**', 'src/server.ts'],
    },
  },
});
