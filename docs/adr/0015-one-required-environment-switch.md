---
status: accepted
---

# One required Environment switch

Three variables decided which environment the API ran in (issue #192). `ENV` (`dev`/`prod`) turned on the secure cookie, production logging and the `TRUST_PROXY` refusal. `ENVIRONMENT` (`development`/`staging`/`production`) named the storage buckets and switched Sentry's PII. `NODE_ENV` fed the development-default refusals, the API references and error detail. Each defaulted to development, so a deploy that forgot one quietly lost the protections it guarded. For example, it would send PII to Sentry (security audit at 910f280).

`ENVIRONMENT` is now the only switch the API's own code reads, and it has no default: an API that is not told its [Environment](../../.knowledge-base/api/glossary.md) does not start.

- **Every protection is on unless the Environment is exactly `development`.** This covers the secure session cookie, production logs, no SQL logging, no API references, the `TRUST_PROXY` refusal, the development-default refusals, no error detail, and no Sentry PII or Spotlight. Staging gets them too. It differs from production only in its bucket names and its Sentry tag.
- **`ENV` is retired with no alias.** For one release the API refuses to start while `ENV` is set, and the error points to the environment-config runbook. That turns a stale `ENV=prod` deploy into a loud failure instead of a silent development boot. A follow-up issue removes the check.
- **`NODE_ENV` stays for third parties.** Node and Better Auth read it (Better Auth uses it for its own cookie, client-IP fallback and error page). It is still declared, but none of our decisions branch on it. A Deployed Environment refuses to start unless `NODE_ENV=production`.
- **Before validation, fail closed.** Sentry starts before the env is validated, so PII and Spotlight need `ENVIRONMENT` to be exactly `development`. Unset or unknown values turn them off.
- **The seed is allow-listed.** It runs only in `development`.
- **Local development states its Environment.** `pnpm initialize` writes `ENVIRONMENT=development` to the gitignored `apps/api/.env`, and CI sets it in workflow `env`. The images do not set it: staging and production share one image, so the deploy platform sets it.

## Consequences

- Every deployment changes its variables once: remove `ENV`, set `ENVIRONMENT`, and keep `NODE_ENV=production` (the image already sets it).
- A staging deploy that ran on `ENV=dev` now gets production's protections and refusals. Its development-default credentials and `mailpit` transport have to go.
- A fresh clone that skips `pnpm initialize` does not start until `ENVIRONMENT` is set.
- The web app still mixes `ENVIRONMENT`, `NODE_ENV` and Vite's mode. Its switches are build-time, so they are a separate decision with its own follow-up issue.

## Considered options

- Keep a `development` default and refuse `NODE_ENV=production` with `ENVIRONMENT=development`: rejected. `NODE_ENV` stays a second switch, and a deploy outside the images is still unguarded.
- Default to `production`: rejected. A fresh clone hits the development-default refusals and does not start.
- Accept `ENV` as an alias for a period: rejected. It keeps the three-way logic alive, which is exactly what this change removes.
- Treat staging as development, or decide behaviour by behaviour: rejected. Staging is a deploy, and a deploy that logs SQL or sets an insecure cookie is the bug.
