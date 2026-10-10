import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = 4173;
const API_PORT = 3001;

/**
 * The flows run against a real API and database, so the API needs its usual environment
 * (database, `BETTER_AUTH_*`, `ORIGIN`/`BETTER_AUTH_URL` set to the web origin below, and
 * `PASSKEY_RP_ID=localhost`), with migrations applied and the admin seeded.
 *
 * Email arrives in Mailpit on :8025. Global setup starts a small stand-in when nothing is
 * listening there; with a real Mailpit running, that is used instead.
 */
export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/support/global-setup.ts',
  // Flows share one database and the single mail inbox.
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @adelie/api start',
      url: `http://localhost:${API_PORT}/api/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `pnpm build && pnpm preview --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
