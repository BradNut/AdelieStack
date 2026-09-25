# API Architectural Decision Records (ADRs)

No detailed API ADR files exist yet. Use current rules/docs as active decisions.

## Active Decision Sources

- [Repo rules](../../../AGENTS.md#non-negotiable-rules)
- [API guide](../../../apps/api/AGENTS.md)
- [API core principles](../core-principles.md)
- [API platform architecture](../platform-architecture.md)

## ADR Template

When creating a new ADR, use this template:

```markdown
# ADR-XXX: [Title]

## Status
[Proposed | Accepted | Deprecated | Superseded]

## Context
[What is the issue that we're seeing that is motivating this decision or change?]

## Decision
[What is the change that we're proposing and/or doing?]

## Consequences
[What becomes easier or more difficult to do because of this change?]

### Positive
- [Benefit 1]
- [Benefit 2]

### Negative
- [Drawback 1]
- [Drawback 2]

## Alternatives Considered
- [Alternative 1]: [Why rejected]
- [Alternative 2]: [Why rejected]

## Related Decisions
- [ADR-XXX]: [Relationship]
```

## Decision Process

1. **Identify Need**: Recognize a decision point
2. **Research**: Investigate options and trade-offs
3. **Propose**: Create ADR draft with status "Proposed"
4. **Review**: Team reviews and provides feedback
5. **Decide**: Update status to "Accepted" or revise
6. **Implement**: Apply the decision
7. **Review**: Periodically review for relevance

## Superseding Decisions

When a decision is superseded:
1. Update old ADR status to "Superseded by ADR-XXX"
2. Create new ADR with status "Accepted"
3. Reference old ADR in "Related Decisions"
