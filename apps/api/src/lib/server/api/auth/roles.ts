import { RoleName } from '@adelie/shared';
import { inject, injectable } from '@needle-di/core';
import type pino from 'pino';
import { ConfigService } from '#lib/server/api/common/configs/config.service';
import { LoggerService } from '#lib/server/api/common/services/logger.service';

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
  const { entries, roles } = parseStoredRoles(stored);
  if (!allowMultiple && entries > 1) {
    logger.warn({ stored }, 'Multi-valued role stored while ALLOW_MULTIPLE_ROLES is off; using the least-privileged role');
    return [LEAST_PRIVILEGED_ROLE];
  }
  return roles.length > 0 ? roles : [LEAST_PRIVILEGED_ROLE];
}

/**
 * Every known role name in the stored value, unnarrowed by `ALLOW_MULTIPLE_ROLES`. Only for checks that must match what
 * Better Auth's admin plugin authorises with, since it reads the stored value as it is; access decisions use `rolesOf`.
 */
export function storedRoleNames(stored: string | null | undefined): RoleName[] {
  return parseStoredRoles(stored).roles;
}

/** The one parse of the stored value: how many comma-separated entries it holds, and the known role names among them. */
function parseStoredRoles(stored: string | null | undefined): { entries: number; roles: RoleName[] } {
  const names = (stored ?? '').split(ROLE_SEPARATOR).map((name) => name.trim());
  return { entries: names.length, roles: names.filter(isRoleName) };
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
