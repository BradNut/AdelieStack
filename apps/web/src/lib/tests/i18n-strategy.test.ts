import { readFileSync } from 'node:fs';
import { REQUEST_LOCALE_ORDER } from '@adelie/shared/constants';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

// `i18n` in src/lib/i18n.ts hands the original request to paraglideMiddleware, which is only correct while no strategy
// rewrites the URL (SvelteKit 3 made event.request read-only). Adding a `url` strategy needs the hook reworked first.
describe('paraglide locale strategy', () => {
  it('is the cookie, Accept-Language, base locale order', () => {
    expect(REQUEST_LOCALE_ORDER).toEqual(['cookie', 'preferredLanguage', 'baseLocale']);
  });

  it('never rewrites the request', () => {
    expect(REQUEST_LOCALE_ORDER).not.toContain('url');
  });

  it('comes from the shared order in the Vite plugin', () => {
    const match = read('vite.config.ts').match(/strategy:\s*([^,\n]*)/);

    expect(match, 'strategy not found in vite.config.ts').not.toBeNull();
    expect(match?.[1]?.trim()).toBe('[...REQUEST_LOCALE_ORDER]');
  });

  it('matches the shared order in the compile script', () => {
    const { scripts } = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    const strategies = (scripts['paraglide:compile'] ?? '').match(/--strategy\s+((?:(?!--)\S+\s*)+)/)?.[1];

    expect(strategies?.trim().split(/\s+/)).toEqual([...REQUEST_LOCALE_ORDER]);
  });
});
