// Gives a local checkout its Environment: writes ENVIRONMENT=development to the API's gitignored `.env` when that
// file does not set ENVIRONMENT (ADR 0015). The API has no default, so a fresh clone needs it. Run by `pnpm initialize`.
// Never rewrites a line: a file that sets ENVIRONMENT, to any value, is left as it is.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEVELOPMENT_LINE = 'ENVIRONMENT=development';

/** An uncommented assignment of ENVIRONMENT, with or without `export`, whatever its value. */
const SETS_ENVIRONMENT = /^\s*(?:export\s+)?ENVIRONMENT\s*=/m;

/**
 * The env file content with ENVIRONMENT=development appended, or `undefined` when `content` already sets ENVIRONMENT.
 * `undefined` content stands for a file that does not exist yet.
 */
export function withDevelopmentEnvironment(content) {
  if (content === undefined) return `${DEVELOPMENT_LINE}\n`;
  if (SETS_ENVIRONMENT.test(content)) return undefined;
  const separator = content === '' || content.endsWith('\n') ? '' : '\n';
  return `${content}${separator}${DEVELOPMENT_LINE}\n`;
}

function main() {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const envFile = process.argv[2] ?? path.join(projectRoot, 'apps', 'api', '.env');
  const updated = withDevelopmentEnvironment(existsSync(envFile) ? readFileSync(envFile, 'utf8') : undefined);
  if (updated === undefined) return;
  writeFileSync(envFile, updated);
  console.log(`Set ${DEVELOPMENT_LINE} in ${path.relative(process.cwd(), envFile) || envFile}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
