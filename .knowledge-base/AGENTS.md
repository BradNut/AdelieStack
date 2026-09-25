# Knowledge Base Agent Index

Token rule: do not read the whole knowledge base. Start from the smallest relevant index, then open only the files matching the task.

## Entry Points

- **API work**: [`api/index.md`](./api/index.md)
- **Web work**: [`web/index.md`](./web/index.md)
- **Repo-level rules**: [`../AGENTS.md`](../AGENTS.md)

## Selection Guide

- **Unfamiliar area**: read that area’s `overview.md` and `core-principles.md`.
- **Implementation task**: read the matching service/feature docs only.
- **Style or conventions**: read the one relevant `standards/*.md` file.
- **Operational task**: read the relevant `runbooks/index.md` entry and linked runbook.
- **Architecture question**: read the relevant `platform-architecture.md` or `decisions/index.md`.

## Stop Condition

After finding the authoritative service, feature, standard, or runbook, stop expanding documentation unless the code contradicts the docs or the task crosses boundaries.
