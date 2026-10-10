/**
 * Content-Security-Policy directives for the web app, consumed by
 * `svelte.config.js` (`kit.csp.directives`). SvelteKit's `csp.mode: 'auto'`
 * (the default) hashes the framework's own inline bootstrap script
 * automatically, so `script-src` does not need `'unsafe-inline'`.
 *
 * Keep this in sync with what the app actually loads:
 * - Vite/SvelteKit's own client bundle and Paraglide's compiled locale
 *   modules are served from `self` (no external script hosts).
 * - `PUBLIC_IMAGE_URI` is the SeaweedFS-backed public bucket the app renders
 *   `<img>`/`<enhanced:img>` sources from (see apps/web/.env.schema); its
 *   origin is added to `img-src` when set so the browser doesn't need a
 *   blanket allowance.
 * - Style is `'self' 'unsafe-inline'` because Svelte transitions/animations
 *   and the static inline `style` attribute in `src/app.html` set the
 *   `style` attribute at runtime; SvelteKit's CSP hashing only covers
 *   `<script>` content, not style attributes.
 * - `mode-watcher`'s dark-mode FOUC-prevention script is rendered as a
 *   `<script nonce="%sveltekit.nonce%">` in `src/app.html`, filled in by
 *   `transformPageChunk` in `src/hooks.server.ts`. SvelteKit adds that
 *   request's nonce to `script-src` (`csp.mode: 'auto'`), so no script hash
 *   is allow-listed: the script body is the bundler-minified
 *   `setInitialMode`, whose hash changes between builds.
 * - `connect-src` gains the local Spotlight origin only when `NODE_ENV` is `development`.
 * - `https://images.unsplash.com` is the placeholder hero image on the
 *   auth pages (`src/routes/(auth)/+layout.svelte`); swap this entry for
 *   a self-hosted asset's origin (or drop it) if that image is replaced.
 *
 * Never add secret values here — this file is bundled at build time and
 * ships to the browser as a response header, not a network resource.
 */

function imageOrigin() {
  const uri = process.env.PUBLIC_IMAGE_URI;
  if (!uri) return null;
  try {
    return new URL(uri).origin;
  } catch {
    return null;
  }
}

const publicImageOrigin = imageOrigin();

/** Sentry's Spotlight sidecar; the SDK only connects to it in development (see `getDevOnlySentryOptions`). */
export const SPOTLIGHT_ORIGIN = 'http://localhost:8969';

/**
 * @param {{ development?: boolean }} [options] `development` adds the local Spotlight origin to `connect-src`.
 * @returns {import('@sveltejs/kit').CspDirectives}
 */
export function createCspDirectives({ development = false } = {}) {
  return {
    'default-src': ["'self'"],
    'base-uri': ["'self'"],
    'connect-src': ["'self'", ...(development ? [SPOTLIGHT_ORIGIN] : [])],
    'font-src': ["'self'", 'data:'],
    'form-action': ["'self'"],
    'frame-ancestors': ["'self'"],
    'frame-src': ["'self'"],
    'img-src': ["'self'", 'data:', 'https://images.unsplash.com', ...(publicImageOrigin ? [publicImageOrigin] : [])],
    'manifest-src': ["'self'"],
    'media-src': ["'self'"],
    'object-src': ["'none'"],
    'script-src': ["'self'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'worker-src': ["'self'"],
  };
}

/** Only an explicit `development` build gets the Spotlight origin; anything else stays strict. */
const cspDirectives = createCspDirectives({ development: process.env.NODE_ENV === 'development' });

export default cspDirectives;
