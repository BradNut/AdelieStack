import { RoleName } from '@adelie/shared';
import { describe, expect, it, vi } from 'vitest';
import { resolveRoles } from '#lib/server/api/auth/roles';

function setup(allowMultiple: boolean) {
  const logger = { warn: vi.fn() };
  return { logger, resolve: (stored: string | null | undefined) => resolveRoles(stored, { allowMultiple, logger }) };
}

describe.each([true, false])('resolveRoles (allowMultiple: %s)', (allowMultiple) => {
  it.each(Object.values(RoleName))('returns a single %s role', (role) => {
    const { resolve, logger } = setup(allowMultiple);

    expect(resolve(role)).toEqual([role]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it.each([null, undefined, '', '   '])('narrows %j to the least-privileged role', (stored) => {
    expect(setup(allowMultiple).resolve(stored)).toEqual([RoleName.USER]);
  });

  it('narrows an unknown value to the least-privileged role', () => {
    expect(setup(allowMultiple).resolve('root')).toEqual([RoleName.USER]);
  });

  it('trims whitespace around a single role', () => {
    expect(setup(allowMultiple).resolve(`  ${RoleName.ADMIN} `)).toEqual([RoleName.ADMIN]);
  });

  it('does not match a role as a substring', () => {
    expect(setup(allowMultiple).resolve('superadmin')).toEqual([RoleName.USER]);
  });
});

describe('resolveRoles with the switch on', () => {
  it('splits and trims several roles', () => {
    expect(setup(true).resolve(` ${RoleName.ADMIN} , ${RoleName.SUPPORT}`)).toEqual([RoleName.ADMIN, RoleName.SUPPORT]);
  });

  it('drops unknown names', () => {
    expect(setup(true).resolve(`root,${RoleName.SUPPORT}`)).toEqual([RoleName.SUPPORT]);
  });

  it('falls back to the least-privileged role when nothing known remains', () => {
    expect(setup(true).resolve('root,,other')).toEqual([RoleName.USER]);
  });

  it('does not warn', () => {
    const { resolve, logger } = setup(true);
    resolve(`${RoleName.ADMIN},${RoleName.SUPPORT}`);

    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe('resolveRoles with the switch off', () => {
  it('treats a multi-valued row as invalid and warns', () => {
    const { resolve, logger } = setup(false);

    expect(resolve(`${RoleName.ADMIN},${RoleName.SUPPORT}`)).toEqual([RoleName.USER]);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
