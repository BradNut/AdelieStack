import type { EnvsDto } from '#lib/server/api/common/configs/dtos/env.dto';
import { TEST_SIGNING_SECRET } from '#lib/server/api/common/configs/tests/env-fixtures';

type TestEnvKey = 'ENV' | 'LOG_LEVEL' | 'ORIGIN' | 'SIGNING_SECRET';

/**
 * Deterministic env values for unit tests. Only keys that services read under test are listed;
 * extend via `overrides` instead of reading `process.env`, so no test depends on a local `.env`.
 */
export const TEST_ENVS: Pick<EnvsDto, TestEnvKey> = {
  ENV: 'dev',
  LOG_LEVEL: 'info',
  ORIGIN: 'http://localhost:5173',
  SIGNING_SECRET: TEST_SIGNING_SECRET,
};

export function createConfigServiceMock(overrides: Partial<EnvsDto> = {}) {
  return { envs: { ...TEST_ENVS, ...overrides } };
}

export type ConfigServiceMock = ReturnType<typeof createConfigServiceMock>;
