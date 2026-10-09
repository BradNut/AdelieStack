import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { otelInstrumentation } from '../otel.middleware';

function createApp() {
  return new Hono().use(otelInstrumentation()).get('/ping', (c) => c.json({ ok: true }));
}

describe('otelInstrumentation middleware', () => {
  it('passes requests through when OTEL_ENABLED is unset', async () => {
    vi.stubEnv('OTEL_ENABLED', '');
    const res = await createApp().request('/ping');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('instruments requests without breaking the response when OTEL_ENABLED is true', async () => {
    vi.stubEnv('OTEL_ENABLED', 'true');
    const res = await createApp().request('/ping');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
