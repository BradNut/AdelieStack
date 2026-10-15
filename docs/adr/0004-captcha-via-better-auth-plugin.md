---
status: accepted
---

# Captcha uses Better Auth's captcha plugin, with the provider chosen by the deployer

We protect anonymous, abusable auth endpoints with Better Auth's `captcha` plugin rather than hand-rolled Hono middleware. The template does not pick a Captcha Provider: whoever clones it chooses one (Cloudflare Turnstile, Google reCAPTCHA, hCaptcha or CaptchaFox) and supplies its secret through the API environment. Captcha is off by default.

The trigger: the template already carries stale Turnstile leftovers (an unused `svelte-turnstile` dependency and CI `TURNSTILE_*` variables) from the generic-layer port, which hard-wire one vendor into a template meant to be cloned. The plugin runs inside Better Auth, so it covers the auth paths without us routing around it, and it already speaks to all four providers.

## Decisions

- `CAPTCHA_ENABLED` defaults to `false`. When `true`, the API refuses to start unless `CAPTCHA_PROVIDER`, `CAPTCHA_SECRET_KEY` and `CAPTCHA_SITE_KEY` are set. `pnpm initialize`, local dev and e2e need no third-party account.
- The API holds all captcha configuration. The web fetches the provider and public site key at runtime from a public API config endpoint, so a clone configures captcha in one place and no web build arg is needed.
- The API supports all four providers. The web ships widgets for Turnstile and hCaptcha behind a `CaptchaWidget` interface; clones add others.
- Protected paths are `/sign-up/email`, `/sign-in/email`, `/request-password-reset` and `/send-verification-email`, kept in one shared `CAPTCHA_PROTECTED_PATHS` constant. Passkey, OAuth and session-bound endpoints are exempt.
- A Captcha Provider outage fails closed with a 503 and a stable error code. The operator kill switch is `CAPTCHA_ENABLED=false` plus a restart, as with `HIBP_ENABLED`.
- The Turnstile widget loads Cloudflare's script directly instead of keeping the `svelte-turnstile` wrapper, so both shipped widgets share one small script loader and the dependency is dropped.
- The web's Content-Security-Policy is static, but the provider is only known at runtime. The shipped providers' script, frame (and for hCaptcha, connect and style) origins are therefore always allow-listed, even when captcha is off. A per-request policy built in a hook would narrow this but would replace SvelteKit's automatic nonce and hash handling, so it is not used. A clone adding a widget adds its origins to `csp-directives.mjs`.
- E2E runs with captcha disabled. The enabled path is covered by API tests with the verify call stubbed, plus one web test that the widget renders when the config endpoint reports it enabled. The runbooks document each provider's official test keys for clones that enable captcha in their own CI.
- The stale `svelte-turnstile`-specific dependency usage and CI `TURNSTILE_*` variables are replaced with the generic names.

## Consequences

- A clone gets working auth with no captcha account, and opts in by setting env only.
- Failing closed means a provider outage blocks sign-up and sign-in until the operator disables captcha; this is accepted, because failing open would let an attacker exploit the outage path.
- We depend on the plugin's supported providers and request header contract (`x-captcha-response`); a provider it doesn't support needs a plugin upgrade or a custom verifier.

## Considered options

- Hand-rolled Hono middleware calling each provider's verify endpoint: rejected because it duplicates what the plugin does and sits outside Better Auth's request pipeline.
- A single fixed provider (Turnstile): rejected because the template should not choose a vendor, account and privacy posture for its clones.
- Failing open on provider outage: rejected because it turns a provider outage, or an attacker causing one, into a captcha bypass.
