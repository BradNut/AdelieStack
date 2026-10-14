import { describe, expect, it, vi } from 'vitest';
import type { Api } from '#lib/utils/types.js';
import { loadSignUpEnabled } from '../public-config';

function apiReturning(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const get = vi.fn().mockResolvedValue(response);
  return { api: { config: { $get: get } } as unknown as Api, get };
}

describe('loadSignUpEnabled', () => {
  it('is true when the API says sign-up is open', async () => {
    const { api } = apiReturning({ ok: true, json: async () => ({ signUpEnabled: true }) });

    expect(await loadSignUpEnabled(api)).toBe(true);
  });

  it('is false when the API says sign-up is closed', async () => {
    const { api } = apiReturning({ ok: true, json: async () => ({ signUpEnabled: false }) });

    expect(await loadSignUpEnabled(api)).toBe(false);
  });

  it('treats a failed response as closed', async () => {
    const { api } = apiReturning({ ok: false });

    expect(await loadSignUpEnabled(api)).toBe(false);
  });

  it('treats a request error as closed', async () => {
    const api = { config: { $get: vi.fn().mockRejectedValue(new Error('boom')) } } as unknown as Api;

    expect(await loadSignUpEnabled(api)).toBe(false);
  });

  it('treats a malformed body as closed', async () => {
    const { api } = apiReturning({ ok: true, json: async () => ({ signUpEnabled: 'yes' }) });

    expect(await loadSignUpEnabled(api)).toBe(false);
  });
});
