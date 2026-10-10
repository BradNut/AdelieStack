---
status: accepted
---

# Agent instructions live in AGENTS.md, not a `.agents/` rules layer

We consolidate all always-on agent guidance into the nested `AGENTS.md` files (root, `apps/api`, `apps/web`) plus the per-repo configuration under `docs/agents/`, and delete the `.agents/rules`, `.agents/prompts`, and `.agents/workflows` directories. `AGENTS.md` is canonical; `CLAUDE.md` is a symlink to it.

The trigger: `.agents/rules` used a `trigger: always_on` convention from Windsurf/Devin that neither harness we run (opencode, Claude Code) reads natively, so the files only reached context through a hand-written pointer, while their content duplicated `.knowledge-base/**/standards/*`. Keeping both `.agents/` and `docs/agents/` also invited confusion between two near-identically named directories.

## Consequences

- The `check:agent-rules` pre-commit and CI enforcement is removed along with the files.
- `.knowledge-base/**/standards/*` becomes the single source of truth for style and standards.
- System-wide decisions live in `docs/adr/`; per-area decisions and glossaries stay in `.knowledge-base/{api,web}`.
- Svelte-specific workflow guidance is delegated to the official Svelte plugins, which inject their own instructions.

## Considered options

- Keeping `.agents/rules` as an enforced always-on layer: rejected because nothing loaded it natively, so the enforcement validated files that never reached an agent.
- Folding the rules into a new root `GLOSSARY.md`/docs tree: rejected in favour of the existing `.knowledge-base` tree, to avoid a second source of truth.
