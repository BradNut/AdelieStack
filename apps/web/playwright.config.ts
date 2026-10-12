import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = 4173;
const API_PORT = 3001;
const WEB_ORIGIN = `http://localhost:${WEB_PORT}`;

/**
 * The flows run against a real API and database, so the API needs its usual environment
 * (database, `BETTER_AUTH_SECRET`, ...), with migrations applied and the admin seeded. The
 * origin settings and the HIBP switch are set below so a shell or `.env.local` pointing at the
 * dev origin (:5173) cannot break the run with "Invalid origin". Breached-password screening
 * is off because the flows must not depend on the external HIBP service. Sign-up is on, because
 * the flows register users through it and it is closed by default.
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
    baseURL: WEB_ORIGIN,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @adelie/api start',
      env: { ORIGIN: WEB_ORIGIN, BETTER_AUTH_URL: WEB_ORIGIN, PASSKEY_RP_ID: 'localhost', HIBP_ENABLED: 'false', SIGN_UP_ENABLED: 'true' },
      url: `http://localhost:${API_PORT}/api/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `pnpm build && pnpm preview --port ${WEB_PORT} --strictPort`,
      env: { ORIGIN: WEB_ORIGIN, BETTER_AUTH_URL: WEB_ORIGIN },
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
