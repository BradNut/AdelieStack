import { fileURLToPath } from 'node:url';
import { compile } from '@inlang/paraglide-js';

/**
 * Vitest global setup: compile paraglide messages before any test file loads, so every way of
 * starting vitest (`pnpm test`, `pnpm vitest run <file>`, IDE runners) works in a fresh checkout.
 * Mirrors the `paraglide:compile` script in package.json.
 */
export default async function setup() {
  await compile({
    project: fileURLToPath(new URL('../../project.inlang', import.meta.url)),
    outdir: fileURLToPath(new URL('../lib/paraglide', import.meta.url)),
    strategy: ['baseLocale'],
    emitTsDeclarations: true,
  });
}
