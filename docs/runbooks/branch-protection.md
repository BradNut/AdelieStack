# Branch protection, dependency alerts and code scanning

Applies to `main` and `development` (#234). The settings live in GitHub, not in git, so this file is the record and
the way to reproduce them. Everything here needs repository admin rights.

## Model

A solo maintainer merges their own pull requests, so the CI checks are the gate, not a reviewer. Both branches
require a pull request and the checks below to pass, **administrators included**, with 0 required approvals. To add a
reviewer later, set `required_approving_review_count` to 1 and re-run the command below.

## Required checks

Matched by job name, so renaming a job in a workflow silently removes it from the gate. Update this list and the
branch rules together.

| Job name                                     | Workflow     |
| -------------------------------------------- | ------------ |
| `Lint (Biome)`                               | `ci.yml`     |
| `Type check (web + API + shared boundaries)` | `ci.yml`     |
| `Unit tests (web + API)`                     | `ci.yml`     |
| `API rate-limit tests (Redis)`               | `ci.yml`     |
| `End-to-end tests (Chromium)`                | `ci.yml`     |
| `Dependency audit (production)`              | `ci.yml`     |
| `CodeQL (javascript-typescript)`             | `codeql.yml` |
| `CodeQL (actions)`                           | `codeql.yml` |

CodeQL is one required job per language, so the seven checks in the spec are eight contexts. `ci.yml` has no
`paths-ignore` on `pull_request` for the same reason: a required check that never runs would leave a docs-only PR
unmergeable.

## Workflow privileges

Every workflow declares read-only `permissions` at the top; a job that needs a write grant sets it on the job with a
comment saying why. CI maps no secrets: jobs run on the `.env.schema` defaults and throwaway placeholders, so fork PRs
work. A secret a future step needs goes on that step only, never at workflow or job level and never on a dependency
install step. `pnpm check:workflow-permissions` enforces this in the lint job (#269).

## Apply

Run after the workflows have merged and each job has run once (GitHub only accepts a required check it has seen).
`PUT` replaces the whole protection object, so this is the complete desired state.

```sh
for branch in main development; do
  gh api -X PUT "repos/BradNut/AdelieStack/branches/$branch/protection" --input - <<'JSON'
{
  "required_status_checks": {
    "strict": false,
    "contexts": [
      "Lint (Biome)",
      "Type check (web + API + shared boundaries)",
      "Unit tests (web + API)",
      "API rate-limit tests (Redis)",
      "End-to-end tests (Chromium)",
      "Dependency audit (production)",
      "CodeQL (javascript-typescript)",
      "CodeQL (actions)"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "dismiss_stale_reviews": true
  },
  "restrictions": null
}
JSON
done
```

Verify:

```sh
for branch in main development; do
  gh api "repos/BradNut/AdelieStack/branches/$branch/protection" \
    --jq '{checks: .required_status_checks.contexts, approvals: .required_pull_request_reviews.required_approving_review_count, admins: .enforce_admins.enabled}'
done
```

## Dependabot

In Settings → Code security, turn on **Dependabot alerts** and **Dependabot security updates**. `.github/dependabot.yml`
sets the npm entry to `target-branch: development` with `open-pull-requests-limit: 0`, so only security updates open
PRs and they land on `development`. Default code-scanning setup stays **off**: `codeql.yml` replaces it.

## Production advisories

`pnpm audit --prod --audit-level=high` runs in CI and fails on any high or critical advisory. The four highs found
at the start of #234 were fixed rather than ignored: `defu`, `joi`, `systeminformation` and `ws` are held at patched
versions by `overrides` in `pnpm-workspace.yaml`. If a future high is judged not exploitable here, record it in
`auditConfig.ignoreGhsas` with a comment giving the reason.

Moderate and low advisories stay visible in the output without blocking. What remains, and why:

| Package                              | Advisory            | Path                                                                                                 | Disposition                                                                                                                                |
| ------------------------------------ | ------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `esbuild` 0.18.20 (moderate)         | GHSA-67mh-4wv8-2f99 | `better-auth > drizzle-kit > @esbuild-kit/*`                                                         | Dev-server request issue in a build tool; the fix is a 0.x minor jump inside a deprecated `drizzle-kit` dependency. Not loaded at runtime. |
| `glob` 10.5.0, 13.0.6 (moderate)     | GHSA-3g3m-2fjr-6pw4 | `@opentelemetry/auto-instrumentations-node > resource-detector-gcp > gcp-metadata > gaxios > rimraf` | Abort-signal bypass in `glob`; needs glob 14, a major bump inside an upstream's cleanup helper. The app never passes request data to it.   |
| `minimatch` 9.0.9, 10.2.6 (moderate) | GHSA-g3hv-75wg-m249 | same path as `glob`                                                                                  | Pattern-amplification DoS; patterns come from the upstream package, not from requests. Fixed with the `glob` bump.                         |
| `deepmerge` 4.3.1 (low)              | GHSA-gcqx-w48m-w2h4 | `better-auth > @sveltejs/kit > @sveltejs/vite-plugin-svelte`                                         | Prototype poisoning in `mergeObject()`; no patched version exists. Reached only through the Vite plugin at build time.                     |

Revisit the table when the upstream packages above publish fixes; `pnpm audit --prod` is the source of truth.
