import { injectable } from '@needle-di/core';
import { describe, expect, it } from 'vitest';
import { ConfigService } from '#lib/server/api/common/configs/config.service';
import { ValkeyRepository } from '#lib/server/api/common/factories/valkey-repository.factory';
import { createTestContainer, mockProvider } from '#lib/server/api/common/testing/test-container';
import { ValkeyService } from '#lib/server/api/databases/valkey/valkey.service';

@injectable()
class SessionsRepository extends ValkeyRepository<'session'> {
  constructor() {
    super('session');
  }
}

@injectable()
class LoginRequestsRepository extends ValkeyRepository<'login-request'> {
  constructor() {
    super('login-request');
  }
}

describe('ValkeyRepository DI wiring', () => {
  it('shares one ValkeyService singleton across every repository resolved from the same container', () => {
    const container = createTestContainer(mockProvider(ConfigService, { envs: { VALKEY_URL: 'redis://localhost:6379' } }));

    const sessions = container.get(SessionsRepository);
    const loginRequests = container.get(LoginRequestsRepository);
    const valkeyService = container.get(ValkeyService);

    // Repository internals are the only way to observe which ValkeyService instance each
    // repository is holding on to, which is exactly what the connection-multiplication bug hid.
    expect((sessions as unknown as { valkey: ValkeyService }).valkey).toBe(valkeyService);
    expect((loginRequests as unknown as { valkey: ValkeyService }).valkey).toBe(valkeyService);
  });

  it('still gives each repository its own runtime key prefix once the ValkeyService is shared', () => {
    const container = createTestContainer(mockProvider(ConfigService, { envs: { VALKEY_URL: 'redis://localhost:6379' } }));

    const sessions = container.get(SessionsRepository);
    const loginRequests = container.get(LoginRequestsRepository);

    expect(sessions.prefix).toBe('session');
    expect(loginRequests.prefix).toBe('login-request');
  });
});
