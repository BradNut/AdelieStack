import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      $lib: path.resolve(currentDirectory, 'src/lib'),
      '@': path.resolve(currentDirectory, 'src/lib'),
    },
  },
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}'],
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
