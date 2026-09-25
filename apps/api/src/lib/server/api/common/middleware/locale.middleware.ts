import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import { type Locale, resolveRequestLocale } from '../i18n';

/**
 * Resolves the request locale from `Accept-Language` (falling back to the base
 * locale), exposes it as `c.var.locale`, and echoes it in `Content-Language`.
 * Must run after `contextStorage()` so `m.*()` calls can read it.
 */
export const requestLocale: MiddlewareHandler<{ Variables: { locale: Locale } }> = createMiddleware(async (c, next) => {
  const locale = resolveRequestLocale(c.req.raw);
  c.set('locale', locale);
  c.header('Content-Language', locale);
  c.header('Vary', 'Accept-Language', { append: true });
  await next();
});
