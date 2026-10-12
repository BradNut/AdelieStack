import { describe, expect, it } from 'vitest';
import { CAPTCHA_ORIGINS, createCspDirectives, SPOTLIGHT_ORIGIN } from '../../../csp-directives.mjs';

describe('createCspDirectives', () => {
  it('allows the local Spotlight origin only in development', () => {
    expect(createCspDirectives({ development: true })['connect-src']).toContain(SPOTLIGHT_ORIGIN);
    expect(createCspDirectives()['connect-src']).not.toContain(SPOTLIGHT_ORIGIN);
  });

  it('keeps script-src to self plus the captcha widget hosts in every mode', () => {
    for (const development of [true, false]) {
      expect(createCspDirectives({ development })['script-src']).toEqual(["'self'", ...CAPTCHA_ORIGINS]);
    }
  });

  it('lets captcha widgets frame their challenge but never allows inline or eval scripts', () => {
    const policy = createCspDirectives();
    expect(policy['frame-src']).toEqual(expect.arrayContaining(CAPTCHA_ORIGINS));
    expect(JSON.stringify(policy['script-src'])).not.toMatch(/unsafe-|\*$/);
  });

  it('allow-lists no script hash or dev host in production', () => {
    const policy = JSON.stringify(createCspDirectives());
    expect(policy).not.toContain('sha256-');
    expect(policy).not.toContain(SPOTLIGHT_ORIGIN);
  });
});
