# Task: Port next generic-layer issues on subagent worktrees → feature branch

Integration branch: `feat/generic-layer-batch` (off `main`).
Each issue runs in its own Jean worktree, implemented by a subagent, then merged
into the integration branch. Stop launching new agents as they approach the
"dumb zone" (~125K–150K tokens); unfinished agents must emit a handoff doc.

## Ready issues (ready-for-agent + unblocked)

- [x] #6  i18n namespaces + locales — committed 9c8ee53, web check green, merged (34b40f3)
- [x] #7  devcontainer + Bruno — committed c95a675, merged (d20dffe)
- [x] #12 audit log — committed 60f8c58, api check + 170 tests green, merged (7bfd5a6)
- [x] #13 Storage: ClamAV virus scanning + webhook (api)
- [x] #14 Jobs: BullMQ jobs service + example cleanup job (api)
- [x] #5  Web: shadcn/ui kit (new-york v4) + missing components (web, heaviest)

## Notes / caveats

- #6 agent was cut off by an ACCOUNT session rate limit (HTTP 429, resets 8:20am PT)
  at 72K tokens — not the dumb zone. Work was uncommitted-but-complete; finished inline.
- #12 migration caveat: repo has no 0000 schema snapshot (uses `db:push`), so drizzle-kit
  emitted a migration that CREATEs all 7 tables. Needs a baseline-snapshot decision; flagged.
- Subagent token spend: #6 72K (cut), #7 63K, #12 61K — all well under 125K dumb zone.

## Blocked / deferred (not this batch)

- #15 Web error pages — blocked by #5
- #16 Auth core design epic — not ready-for-agent

## Waves

- Wave 1 (parallel, low mutual conflict): #6, #7, #12
- Wave 2 (parallel): #13, #14, #5

## Merge-back

Each subagent commits to its issue branch; merge each into
`feat/generic-layer-batch` after it returns. Clean up worktrees after merge.

## Review

(to fill in)


## Review
- All 6 ready issues merged into feat/generic-layer-batch; api 194 tests + web svelte-check green.
- Open: approve/drop 3 suppressions from #5 (utils.ts x2, carousel.svelte x1); #12 migration baseline; #15 now unblocked.
