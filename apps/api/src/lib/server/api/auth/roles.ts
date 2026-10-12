import { RoleName } from '@adelie/shared';
import { inject, injectable } from '@needle-di/core';
import type pino from 'pino';
import { ConfigService } from '../common/configs/config.service';
import { LoggerService } from '../common/services/logger.service';

const ROLE_NAMES: readonly string[] = Object.values(RoleName);
const ROLE_SEPARATOR = ',';
/** Role given to anyone whose stored value is empty or invalid. */
const LEAST_PRIVILEGED_ROLE = RoleName.USER;

function isRoleName(role: string): role is RoleName {
  return ROLE_NAMES.includes(role);
}

interface ResolveRolesOptions {
  allowMultiple: boolean;
  logger: Pick<pino.Logger, 'warn'>;
}

/**
 * The only reader of the stored role value (Better Auth's admin plugin keeps it as one string,
 * comma-separated when a user has several). Always returns at least one known role.
 */
export function resolveRoles(stored: string | null | undefined, { allowMultiple, logger }: ResolveRolesOptions): RoleName[] {
  const names = (stored ?? '').split(ROLE_SEPARATOR).map((name) => name.trim());
  if (!allowMultiple && names.length > 1) {
    logger.warn({ stored }, 'Multi-valued role stored while ALLOW_MULTIPLE_ROLES is off; using the least-privileged role');
    return [LEAST_PRIVILEGED_ROLE];
  }
  const roles = names.filter(isRoleName);
  return roles.length > 0 ? roles : [LEAST_PRIVILEGED_ROLE];
}

/** Resolves roles with the environment's switch and logger, read lazily on each call. */
@injectable()
export class RolesService {
  constructor(
    private readonly configService = inject(ConfigService),
    private readonly loggerService = inject(LoggerService),
  ) {}

  rolesOf(user: { role?: string | null }): RoleName[] {
    return resolveRoles(user.role, {
      allowMultiple: this.configService.envs.ALLOW_MULTIPLE_ROLES,
      logger: this.loggerService.log,
    });
  }
}
