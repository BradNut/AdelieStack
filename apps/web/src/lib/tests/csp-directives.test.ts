import { describe, expect, it } from 'vitest';
import { createCspDirectives, SPOTLIGHT_ORIGIN } from '../../../csp-directives.mjs';

describe('createCspDirectives', () => {
  it('allows the local Spotlight origin only in development', () => {
    expect(createCspDirectives({ development: true })['connect-src']).toContain(SPOTLIGHT_ORIGIN);
    expect(createCspDirectives()['connect-src']).toEqual(["'self'"]);
  });

  it('keeps script-src strict in every mode', () => {
    for (const development of [true, false]) {
      expect(createCspDirectives({ development })['script-src']).toEqual(["'self'"]);
    }
  });

  it('allow-lists no script hash or dev host in production', () => {
    const policy = JSON.stringify(createCspDirectives());
    expect(policy).not.toContain('sha256-');
    expect(policy).not.toContain(SPOTLIGHT_ORIGIN);
  });
});
