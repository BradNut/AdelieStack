import { CAPTCHA_RESPONSE_HEADER } from '@adelie/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCaptchaForm } from '#lib/client/captcha/captcha-form.svelte.ts';
import { CAPTCHA_BINDING_HEADER, CAPTCHA_BINDING_VALUE } from '#lib/constants/captcha.ts';

const TOKEN = 'widget-token';

/** Stands in for the mounted CaptchaField: resetting it clears the token, as the real field does via `onchange('')`. */
function mountedForm() {
  const captcha = createCaptchaForm();
  const reset = vi.fn(() => captcha.setToken(''));
  captcha.field = { reset };
  return { captcha, reset };
}

describe('createCaptchaForm attempt', () => {
  let form: ReturnType<typeof mountedForm>;

  beforeEach(() => {
    form = mountedForm();
  });

  it('uses the internal binding marker header name', () => {
    expect(CAPTCHA_BINDING_HEADER).toBe('x-adelie-captcha-bound');
  });

  it('attaches the Captcha Token and the binding marker when a token is present', async () => {
    form.captcha.setToken(TOKEN);
    const fn = vi.fn(async () => ({ data: {}, error: null }));

    await form.captcha.attempt(fn);

    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith({ headers: { [CAPTCHA_BINDING_HEADER]: CAPTCHA_BINDING_VALUE, [CAPTCHA_RESPONSE_HEADER]: TOKEN } });
  });

  it('sends only the binding marker when there is no token (captcha off)', async () => {
    const fn = vi.fn(async () => ({ data: {}, error: null }));

    await form.captcha.attempt(fn);

    expect(fn).toHaveBeenCalledWith({ headers: { [CAPTCHA_BINDING_HEADER]: CAPTCHA_BINDING_VALUE } });
  });

  it('sends the binding marker even when no field is mounted', async () => {
    const captcha = createCaptchaForm();
    const fn = vi.fn(async () => 'ok');

    expect(await captcha.attempt(fn)).toBe('ok');
    expect(fn).toHaveBeenCalledWith({ headers: { [CAPTCHA_BINDING_HEADER]: CAPTCHA_BINDING_VALUE } });
  });

  it("returns fn's result and resets the widget after a success result", async () => {
    form.captcha.setToken(TOKEN);
    const result = { data: { id: 'u1' }, error: null };

    expect(await form.captcha.attempt(async () => result)).toBe(result);
    expect(form.reset).toHaveBeenCalledOnce();
  });

  it('returns an error result unchanged and still resets the widget', async () => {
    form.captcha.setToken(TOKEN);
    const result = { data: null, error: { code: 'INVALID', message: 'nope' } };

    expect(await form.captcha.attempt(async () => result)).toBe(result);
    expect(form.reset).toHaveBeenCalledOnce();
  });

  it('rethrows when fn throws and still resets the widget', async () => {
    form.captcha.setToken(TOKEN);
    const failure = new Error('network down');

    await expect(
      form.captcha.attempt(async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(form.reset).toHaveBeenCalledOnce();
  });

  it('resets only after fn settles, so the token is still attached while the call is in flight', async () => {
    form.captcha.setToken(TOKEN);
    let resetDuringCall: boolean | undefined;

    await form.captcha.attempt(async () => {
      await Promise.resolve();
      resetDuringCall = form.reset.mock.calls.length > 0;
    });

    expect(resetDuringCall).toBe(false);
    expect(form.reset).toHaveBeenCalledOnce();
  });

  it('never resends a single-use token: the next attempt goes without it', async () => {
    form.captcha.setToken(TOKEN);
    await form.captcha.attempt(async () => null);
    const next = vi.fn(async () => null);

    await form.captcha.attempt(next);

    expect(next).toHaveBeenCalledWith({ headers: { [CAPTCHA_BINDING_HEADER]: CAPTCHA_BINDING_VALUE } });
  });

  it('keeps tokens separate between instances', async () => {
    const other = mountedForm();
    form.captcha.setToken(TOKEN);
    const fn = vi.fn(async () => null);

    await other.captcha.attempt(fn);

    expect(fn).toHaveBeenCalledWith({ headers: { [CAPTCHA_BINDING_HEADER]: CAPTCHA_BINDING_VALUE } });
    expect(form.reset).not.toHaveBeenCalled();
    expect(other.reset).toHaveBeenCalledOnce();
  });
});
