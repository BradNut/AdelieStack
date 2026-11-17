// @vitest-environment jsdom
import type { AuthedUser } from '@adelie/shared';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authClient = vi.hoisted(() => ({ updateUser: vi.fn() }));
const applyPreferredLanguage = vi.hoisted(() => vi.fn());

vi.mock('#lib/auth-client.ts', () => ({ authClient }));
vi.mock('#lib/client/preferred-language.ts', () => ({ applyPreferredLanguage }));
vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { toast } from 'svelte-sonner';
import { buildAuthedUser } from '#lib/tests/factories.ts';
import { refreshAll } from '$app/navigation';
import SettingsPage from '../+page.svelte';

const SAVED = { data: { status: true }, error: null };

function mount(user: Partial<Pick<AuthedUser, 'preferredLanguage' | 'impersonating'>> = {}) {
  const authedUser = buildAuthedUser(user);
  return render(SettingsPage, { data: { socialProviders: [], signUpEnabled: false, flash: undefined, authedUser } });
}

const choice = (name: string) => screen.getByRole('radio', { name });
const checkedChoice = () => screen.getAllByRole('radio').find((radio) => radio.getAttribute('aria-checked') === 'true');

async function save(name: string) {
  const user = userEvent.setup();
  await user.click(choice(name));
  await user.click(screen.getByRole('button', { name: 'Save language' }));
}

beforeEach(() => {
  authClient.updateUser.mockReset().mockResolvedValue(SAVED);
  applyPreferredLanguage.mockReset();
  vi.mocked(refreshAll).mockReset();
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
});

afterEach(cleanup);

describe('settings page language picker', () => {
  it('lists the supported locales and "Match my browser"', () => {
    mount();

    const radios = screen.getAllByRole('radio');
    const names = ['Match my browser', 'English', 'Deutsch', 'Español'];

    expect(names.map((name) => radios.indexOf(choice(name)))).toEqual([0, 1, 2, 3]);
    expect(radios).toHaveLength(names.length);
  });

  it('shows the stored Preferred Language as chosen', () => {
    mount({ preferredLanguage: 'de' });

    expect(checkedChoice()).toBe(choice('Deutsch'));
  });

  it.each([null, 'fr'])('shows "Match my browser" for a stored %s', (preferredLanguage) => {
    mount({ preferredLanguage });

    expect(checkedChoice()).toBe(choice('Match my browser'));
  });

  it('saves the chosen locale and makes the site follow it', async () => {
    mount();

    await save('Español');

    await waitFor(() => expect(applyPreferredLanguage).toHaveBeenCalledExactlyOnceWith('es'));
    expect(authClient.updateUser).toHaveBeenCalledExactlyOnceWith({ locale: 'es' });
    expect(toast.success).toHaveBeenCalledOnce();
  });

  it('saves "Match my browser" as no Preferred Language', async () => {
    mount({ preferredLanguage: 'de' });

    await save('Match my browser');

    await waitFor(() => expect(applyPreferredLanguage).toHaveBeenCalledExactlyOnceWith(null));
    expect(authClient.updateUser).toHaveBeenCalledExactlyOnceWith({ locale: null });
  });

  it("saves while impersonating but leaves the admin's own language alone", async () => {
    mount({ impersonating: true });

    await save('Deutsch');

    await waitFor(() => expect(refreshAll).toHaveBeenCalledOnce());
    expect(authClient.updateUser).toHaveBeenCalledExactlyOnceWith({ locale: 'de' });
    expect(applyPreferredLanguage).not.toHaveBeenCalled();
  });

  it('shows a refused save and keeps the site as it is', async () => {
    authClient.updateUser.mockResolvedValue({ data: null, error: { status: 400, message: 'Invalid locale' } });
    mount();

    await save('Deutsch');

    await waitFor(() => expect(toast.error).toHaveBeenCalledExactlyOnceWith('Invalid locale'));
    expect(applyPreferredLanguage).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
