import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

// `i18n` in src/lib/i18n.ts hands the original request to paraglideMiddleware, which is only correct while no strategy
// rewrites the URL (SvelteKit 3 made event.request read-only). Adding a `url` strategy needs the hook reworked first.
describe('paraglide locale strategy', () => {
  it('is cookie + baseLocale in the Vite plugin', () => {
    const match = read('vite.config.ts').match(/strategy:\s*\[([^\]]*)\]/);

    expect(match, 'strategy not found in vite.config.ts').not.toBeNull();
    expect(match?.[1]).not.toContain('url');
    expect(match?.[1]).toContain('cookie');
  });

  it('is cookie + baseLocale in the compile script', () => {
    const { scripts } = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    const script = scripts['paraglide:compile'] ?? '';

    expect(script).toMatch(/--strategy\s/);
    expect(script).not.toMatch(/--strategy[^-]*\burl\b/);
  });
});
