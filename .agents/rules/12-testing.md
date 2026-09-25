---
trigger: always_on
---

# Testing Guidelines

## Coverage Expectations

- Every test suite: positive (happy path) + negative (error/edge-case) coverage.
- Raise any suite below A+ standards.

## Required Negative Test Scenarios

- Validation failures (invalid input, missing required fields)
- Resource not found (404-style behavior)
- Duplicate and unique-constraint violations
- Permission and authorization failures
- External dependency failures (mocked)
- Edge boundaries (empty strings, null/undefined, min/max length and boundary values)

## Scope Expectations

- Services: all public methods covered
- Routes/API handlers: success and failure responses covered
- Components: user interactions and edge-state rendering covered
- Utilities: exported functions covered, including edge cases

## Practical Testing Notes

- Prefer behavior-driven assertions over implementation details.
- Mock external services and integrations, not internal logic.
- Keep tests deterministic and isolated.
