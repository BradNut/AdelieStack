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
 * - `mode-watcher`'s dark-mode FOUC-prevention script is injected via
 *   `{@html}` in a `<svelte:head>` block, so SvelteKit's automatic
 *   `csp.mode: 'auto'` nonce (which only covers scripts the framework
 *   renders itself, e.g. the hydration bootstrap) does not apply to it —
 *   verified by inspecting the served HTML, where this script has no
 *   `nonce` attribute and the browser blocks it. Allow-listed by exact
 *   content hash instead, the same approach the reference app uses. The
 *   script's content is fully static (same default `<ModeWatcher />`
 *   config as the reference app), so the hash does not change across
 *   builds; if `<ModeWatcher>`'s props in `src/routes/+layout.svelte`
 *   ever change, recompute the hash from the browser's console error.
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

/** @type {import('@sveltejs/kit').CspDirectives} */
const cspDirectives = {
  'default-src': ["'self'"],
  'base-uri': ["'self'"],
  'connect-src': ["'self'"],
  'font-src': ["'self'", 'data:'],
  'form-action': ["'self'"],
  'frame-ancestors': ["'self'"],
  'frame-src': ["'self'"],
  'img-src': ["'self'", 'data:', 'https://images.unsplash.com', ...(publicImageOrigin ? [publicImageOrigin] : [])],
  'manifest-src': ["'self'"],
  'media-src': ["'self'"],
  'object-src': ["'none'"],
  'script-src': ["'self'", "'sha256-94WxU203ItVdYeuHa4UBPQzWANAxvaHV/BgTnRrE/14='"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'worker-src': ["'self'"],
};

export default cspDirectives;
