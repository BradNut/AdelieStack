// @vitest-environment jsdom
// Vitest resolves the browser export condition (vite.config.ts), so Kit 3's redirect() takes its client build, which reads `window`.
import { AppRoute, SIGN_UP_CLOSED_MESSAGE } from '@adelie/shared';
import { describe, expect, it, vi } from 'vitest';
import { buildLoadEvent, catchRedirect } from '#lib/tests/load-event.ts';
import { load } from '../+page.server';

function event({ user = null, signUpEnabled }: { user?: object | null; signUpEnabled: boolean }) {
  return buildLoadEvent<Parameters<typeof load>[0]>({ path: AppRoute.SIGNUP, user, parent: { signUpEnabled } });
}

describe('/signup load', () => {
  it('sends a visitor to login when registration is closed', async () => {
    const thrown = await catchRedirect(() => load(event({ signUpEnabled: false })));

    expect(thrown?.status).toBe(303);
    expect(thrown?.location).toBe(AppRoute.LOGIN);
  });

  it('flashes the closed-registration message', async () => {
    const e = event({ signUpEnabled: false });
    await catchRedirect(() => load(e));

    const [, value] = vi.mocked(e.cookies.set).mock.calls[0];
    expect(decodeURIComponent(String(value))).toContain(SIGN_UP_CLOSED_MESSAGE);
  });

  it('lets a visitor in when registration is open', async () => {
    expect(await catchRedirect(() => load(event({ signUpEnabled: true })))).toBeNull();
  });

  it('still sends a signed-in user home, whatever the flag says', async () => {
    const thrown = await catchRedirect(() => load(event({ user: { id: 'u1' }, signUpEnabled: false })));

    expect(thrown?.location).toBe(AppRoute.HOME);
  });
});
