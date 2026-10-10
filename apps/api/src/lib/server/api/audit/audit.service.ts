import { inject, injectable } from '@needle-di/core';
import { RequestContextService } from '../common/services/request-context.service';
import { AuditRepository } from './audit.repository';

/**
 * Well-known security-relevant actions. Callers may pass any string, but these
 * constants keep call sites consistent and greppable. Prefer reusing an entry
 * over introducing a new literal.
 */
export const SecurityAuditAction = {
  LOGIN_SUCCEEDED: 'login_succeeded',
  LOGIN_FAILED: 'login_failed',
  LOGOUT: 'logout',
  PASSWORD_CHANGED: 'password_changed',
  PASSWORD_RESET_REQUESTED: 'password_reset_requested',
  EMAIL_CHANGED: 'email_changed',
  MFA_ENABLED: 'mfa_enabled',
  MFA_DISABLED: 'mfa_disabled',
  ROLE_GRANTED: 'role_granted',
  ROLE_REVOKED: 'role_revoked',
  ACCOUNT_LOCKED: 'account_locked',
} as const;

export type SecurityAuditAction = (typeof SecurityAuditAction)[keyof typeof SecurityAuditAction];

export interface AuditRecordInput {
  /** What happened. Use a {@link SecurityAuditAction} where one fits. */
  action: SecurityAuditAction | (string & {});
  /** The kind of entity the action targeted (e.g. `'user'`, `'session'`). */
  entityType: string;
  /** The targeted entity's id, when the action is scoped to one. */
  entityId?: string | null;
  /** Overrides the actor resolved from the request context. */
  actorUserId?: string | null;
  /** Overrides the request id resolved from the request context. */
  requestId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  /** Arbitrary JSON context (reason, changed fields, ...). */
  metadata?: unknown;
}

@injectable()
export class AuditService {
  constructor(
    private readonly auditRepository = inject(AuditRepository),
    private readonly requestContextService = inject(RequestContextService),
  ) {}

  /**
   * Append a security event to the audit log. `actorUserId`/`requestId` default
   * to the current request context when omitted, and fall back to `null` when
   * recording outside of a request (e.g. a background job).
   */
  async record(input: AuditRecordInput) {
    const actorUserId = input.actorUserId ?? this.resolveActorUserId();
    const requestId = input.requestId ?? this.resolveRequestId();

    return this.auditRepository.create({
      actor_user_id: actorUserId,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      request_id: requestId,
      ip: input.ip ?? null,
      user_agent: input.userAgent ?? null,
      metadata: input.metadata ?? null,
    });
  }

  async findById(id: string) {
    return this.auditRepository.findOneById(id);
  }

  async findByEntity(entityType: string, entityId: string) {
    return this.auditRepository.findManyByEntity(entityType, entityId);
  }

  async findByActor(actorUserId: string) {
    return this.auditRepository.findManyByActor(actorUserId);
  }

  /**
   * Resolve the authenticated actor from the request context, tolerating the
   * absence of a request scope so recording never crashes a non-request caller.
   */
  private resolveActorUserId(): string | null {
    try {
      return this.requestContextService.getAuthedUserId() ?? null;
    } catch {
      return null;
    }
  }

  private resolveRequestId(): string | null {
    try {
      return this.requestContextService.getRequestId() ?? null;
    } catch {
      return null;
    }
  }
}
