import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Vitest global setup: compile paraglide messages before any test file loads, so every way of
 * starting vitest (`pnpm test`, `pnpm vitest run <file>`, IDE runners) works in a fresh checkout.
 * Runs the package's `paraglide:compile` script, which stays the single source of the compile flags.
 */
export default function setup() {
  execFileSync('pnpm', ['run', '--silent', 'paraglide:compile'], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    stdio: 'inherit',
  });
}
