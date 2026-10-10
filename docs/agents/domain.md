# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`.knowledge-base/api/glossary.md`** and **`.knowledge-base/web/glossary.md`**: the domain glossaries. Read the one for the side you are working on (both for cross-stack work).
- **`docs/adr/`** at the repo root: read ADRs that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill creates them lazily when terms or decisions actually get resolved. Per that skill's `GLOSSARY.md` convention, new terms go in the existing knowledge-base glossaries; do not create a second glossary.

## File structure

Single-context repo:

```
/
├── .knowledge-base/
│   ├── api/glossary.md
│   └── web/glossary.md
└── docs/adr/
    └── 0001-agent-instruction-layout.md
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in the relevant glossary. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in a glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
