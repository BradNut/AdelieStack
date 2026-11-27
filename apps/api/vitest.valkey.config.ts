import { defineConfig } from 'vitest/config';

/** Tests that need a real Valkey (VALKEY_URL). Run with `pnpm test:valkey`; the default config leaves them out. */
export default defineConfig({
  test: {
    include: ['src/**/*.valkey.test.ts'],
    environment: 'node',
    restoreMocks: true,
    unstubEnvs: true,
  },
});
