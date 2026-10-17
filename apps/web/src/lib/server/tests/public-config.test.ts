import { describe, expect, it, vi } from 'vitest';
import type { Api } from '#lib/utils/types.ts';
import { FALLBACK_PUBLIC_CONFIG, loadPublicConfig } from '../public-config';

function apiReturning(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const get = vi.fn().mockResolvedValue(response);
  return { api: { config: { $get: get } } as unknown as Api, get };
}

describe('loadPublicConfig', () => {
  it('passes through sign-up and the enabled social providers', async () => {
    const { api } = apiReturning({ ok: true, json: async () => ({ signUpEnabled: true, socialProviders: ['github', 'google'] }) });

    expect(await loadPublicConfig(api)).toEqual({ signUpEnabled: true, socialProviders: ['github', 'google'] });
  });

  it('reports sign-up closed and no providers on a fresh install', async () => {
    const { api } = apiReturning({ ok: true, json: async () => ({ signUpEnabled: false, socialProviders: [] }) });

    expect(await loadPublicConfig(api)).toEqual({ signUpEnabled: false, socialProviders: [] });
  });

  it('falls back to closed with no providers on a failed response', async () => {
    const { api } = apiReturning({ ok: false });

    expect(await loadPublicConfig(api)).toEqual(FALLBACK_PUBLIC_CONFIG);
  });

  it('falls back on a request error', async () => {
    const api = { config: { $get: vi.fn().mockRejectedValue(new Error('boom')) } } as unknown as Api;

    expect(await loadPublicConfig(api)).toEqual(FALLBACK_PUBLIC_CONFIG);
  });

  it('falls back on a malformed body', async () => {
    const { api } = apiReturning({ ok: true, json: async () => ({ signUpEnabled: 'yes', socialProviders: [] }) });

    expect(await loadPublicConfig(api)).toEqual(FALLBACK_PUBLIC_CONFIG);
  });

  it('falls back when an unknown provider is reported, rather than rendering a button that cannot work', async () => {
    const { api } = apiReturning({ ok: true, json: async () => ({ signUpEnabled: true, socialProviders: ['myspace'] }) });

    expect(await loadPublicConfig(api)).toEqual(FALLBACK_PUBLIC_CONFIG);
  });
});
