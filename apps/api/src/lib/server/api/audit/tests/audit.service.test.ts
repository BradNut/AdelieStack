import { beforeEach, describe, expect, it } from 'vitest';
import { AuditRepository } from '#lib/server/api/audit/audit.repository';
import { AuditService, SecurityAuditAction } from '#lib/server/api/audit/audit.service';
import { RequestContextService } from '#lib/server/api/common/services/request-context.service';
import { createInMemoryAuditRepository, type InMemoryAuditRepository } from '#lib/server/api/common/testing/in-memory-audit-repository';
import { createTestContainer, mockProvider } from '#lib/server/api/common/testing/test-container';

function buildService(requestContext: Partial<RequestContextService> = {}) {
  const repository = createInMemoryAuditRepository();
  const container = createTestContainer(
    mockProvider(AuditRepository, repository),
    mockProvider(RequestContextService, {
      getAuthedUserId: () => undefined,
      getRequestId: () => {
        throw new Error('no request context');
      },
      ...requestContext,
    }),
  );
  return { service: container.get(AuditService), repository };
}

describe('AuditService', () => {
  let service: AuditService;
  let repository: InMemoryAuditRepository;

  beforeEach(() => {
    ({ service, repository } = buildService());
  });

  it('records a security event and queries it back by entity', async () => {
    const recorded = await service.record({
      action: SecurityAuditAction.PASSWORD_CHANGED,
      entityType: 'user',
      entityId: 'user-123',
      actorUserId: 'user-123',
      requestId: 'req-abc',
      ip: '203.0.113.7',
      userAgent: 'vitest',
      metadata: { reason: 'self-service' },
    });

    expect(recorded.id).toBeTruthy();

    const found = await service.findByEntity('user', 'user-123');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      id: recorded.id,
      action: SecurityAuditAction.PASSWORD_CHANGED,
      entity_type: 'user',
      entity_id: 'user-123',
      actor_user_id: 'user-123',
      request_id: 'req-abc',
      ip: '203.0.113.7',
      user_agent: 'vitest',
      metadata: { reason: 'self-service' },
    });

    const byId = await service.findById(recorded.id);
    expect(byId?.id).toBe(recorded.id);
  });

  it('defaults actor and request id to the current request context', async () => {
    ({ service, repository } = buildService({
      getAuthedUserId: () => 'ctx-actor',
      getRequestId: () => 'ctx-request',
    }));

    await service.record({
      action: SecurityAuditAction.LOGIN_SUCCEEDED,
      entityType: 'session',
      entityId: 'sess-1',
    });

    const [row] = await service.findByActor('ctx-actor');
    expect(row).toMatchObject({
      actor_user_id: 'ctx-actor',
      request_id: 'ctx-request',
      action: SecurityAuditAction.LOGIN_SUCCEEDED,
    });
  });

  it('records anonymous events with null actor/request when no context is available', async () => {
    // Default mock throws from getRequestId and returns undefined actor,
    // simulating recording outside of a request scope (e.g. a failed login).
    const recorded = await service.record({
      action: SecurityAuditAction.LOGIN_FAILED,
      entityType: 'user',
      metadata: { email: 'penguin@example.com' },
    });

    expect(recorded.actor_user_id).toBeNull();
    expect(recorded.request_id).toBeNull();
    expect(recorded.entity_id).toBeNull();
    expect(repository.rows).toHaveLength(1);
  });

  it('returns an empty list when no events match the entity', async () => {
    await service.record({ action: SecurityAuditAction.LOGOUT, entityType: 'session', entityId: 'sess-1' });

    const found = await service.findByEntity('user', 'does-not-exist');
    expect(found).toEqual([]);
  });
});
