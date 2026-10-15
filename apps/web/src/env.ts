import { defineEnvVars } from '@sveltejs/kit/env';

/** An optional variable: unset or empty means `undefined`. */
const optional = (value: string | undefined) => value || undefined;

/**
 * Variables the web app reads through SvelteKit (`$app/env/private` / `$app/env/public`).
 * `.env.schema` (varlock) stays the source of truth for types, defaults and required-ness; list a variable here only when app code imports it.
 */
export const variables = defineEnvVars({
  API_PROXY_BASE_URL: {
    schema: optional,
    description: 'Base URL of the API for the /api proxy; the proxy falls back to its default when empty.',
  },
  PUBLIC_IMAGE_URI: {
    public: true,
    static: true,
    description: 'Public base URL of the image bucket.',
  },
  PUBLIC_SENTRY_DSN: {
    public: true,
    schema: optional,
    description: 'Sentry runtime DSN; empty reports to Spotlight only.',
  },
});
