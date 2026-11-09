import { createServer } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { AuditRepository } from '#lib/server/api/audit/audit.repository';
import { ConfigService } from '#lib/server/api/common/configs/config.service';
import { createTestContainer, mockProvider } from '#lib/server/api/common/testing/test-container';
import { AuditCleanupJob } from '#lib/server/api/jobs/audit-cleanup.job';

/** Written out rather than imported, so a changed limit fails here. */
const REGISTER_LIMIT_MS = 10_000;
/** Room for the connections to close once the limit passes. */
const CLOSE_MARGIN_MS = 3_000;

/** A port that was just free, so nothing is listening on it. */
async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('expected a TCP address');
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}

/**
 * Runs real BullMQ against a port nobody listens on. BullMQ retries forever there and never rejects, so this is
 * what shows the limit holds for the real client. Needs no running Redis, but it lives in this config because the
 * default one blocks real sockets.
 */
describe('AuditCleanupJob against an unreachable Redis', () => {
  it('fails register within the limit', { timeout: REGISTER_LIMIT_MS + CLOSE_MARGIN_MS * 2 }, async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const redisUrl = `redis://127.0.0.1:${await closedPort()}`;
    const job = createTestContainer(mockProvider(ConfigService, { envs: { REDIS_URL: redisUrl } }), mockProvider(AuditRepository, {})).get(
      AuditCleanupJob,
    );

    const startedAt = performance.now();
    await expect(job.register()).rejects.toThrow(/did not finish within 10000ms/);
    const elapsedMs = performance.now() - startedAt;

    expect(elapsedMs).toBeGreaterThanOrEqual(REGISTER_LIMIT_MS - 50);
    expect(elapsedMs).toBeLessThan(REGISTER_LIMIT_MS + CLOSE_MARGIN_MS);
  });
});
