// @vitest-environment jsdom
// Vitest resolves the browser export condition (vite.config.ts), so Kit 3's redirect() takes its client build, which reads `window`.
import { AppRoute } from '@adelie/shared';
import { describe, expect, it, vi } from 'vitest';
import { buildLoadEvent, catchRedirect } from '#lib/tests/load-event.ts';
import { alreadySignedInMessage } from '#lib/utils/flashMessages.ts';
import { load } from '../+page.server';

const SIGNED_IN = { id: 'u1' };

function event({ user = null, search = '' }: { user?: object | null; search?: string }) {
  return buildLoadEvent<Parameters<typeof load>[0]>({ path: `${AppRoute.PASSWORD_RESET}${search}`, user });
}

describe('/password/reset load', () => {
  it('hands a signed-in browser the link token, so the reset form shows', async () => {
    expect(await load(event({ user: SIGNED_IN, search: '?token=link-token' }))).toEqual({ token: 'link-token', linkError: null });
  });

  it('hands a signed-in browser the link error, so the dead-link alert shows', async () => {
    expect(await load(event({ user: SIGNED_IN, search: '?error=INVALID_TOKEN' }))).toEqual({ token: null, linkError: 'INVALID_TOKEN' });
  });

  it('sends a signed-in visit without a link to change-password settings', async () => {
    const thrown = await catchRedirect(() => load(event({ user: SIGNED_IN })));

    expect(thrown?.status).toBe(303);
    expect(thrown?.location).toBe(AppRoute.SETTINGS_PASSWORD);
  });

  it('flashes "already signed in" on that redirect', async () => {
    const e = event({ user: SIGNED_IN });
    await catchRedirect(() => load(e));

    const [, value] = vi.mocked(e.cookies.set).mock.calls[0];
    expect(decodeURIComponent(String(value))).toContain(alreadySignedInMessage.message);
  });

  it('ignores an empty token on a signed-in visit', async () => {
    const thrown = await catchRedirect(() => load(event({ user: SIGNED_IN, search: '?token=' })));

    expect(thrown?.location).toBe(AppRoute.SETTINGS_PASSWORD);
  });

  it('hands a signed-out browser the link token', async () => {
    expect(await load(event({ search: '?token=link-token' }))).toEqual({ token: 'link-token', linkError: null });
  });

  it('shows a signed-out visit without a link the request form', async () => {
    expect(await load(event({}))).toEqual({ token: null, linkError: null });
  });
});
