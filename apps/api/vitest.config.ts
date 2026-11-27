import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}'],
    // Real-Valkey tests run through vitest.valkey.config.ts (`pnpm test:valkey`).
    exclude: [...configDefaults.exclude, 'src/**/*.valkey.test.ts'],
    environment: 'node',
    globalSetup: ['./src/test/paraglide.global-setup.ts'],
    // Unit tests must not reach the real network; the real-Valkey config deliberately skips this.
    setupFiles: ['./src/test/network-guard.setup.ts'],
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    coverage: {
      include: ['src/**/*.{js,ts}'],
      exclude: ['**/*.{test,spec}.{js,ts}', 'src/test/**', '**/common/testing/**', '**/migrate.ts', '**/seed.ts', '**/seeds/**'],
    },
  },
});
