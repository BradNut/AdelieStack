---
status: accepted
---

# Authorization delegates to Better Auth's permission check

Routes that need authorization call Better Auth's `userHasPermission` through the permission middleware (`common/middleware/permission.middleware.ts`), passing the user's resolved roles and the required permissions. Permissions are defined once in `auth/auth.permissions.ts`. We do not build further role-name middleware of our own.

The trigger: checking role names in routes duplicates what the admin plugin already answers, and lets route code drift from the permission table. Delegating keeps one source of truth for what each role may do, and multi-role handling (`ALLOW_MULTIPLE_ROLES`) stays in `auth/roles.ts`.

## Consequences

- New protected routes declare the permission they need, never a role name.
- The existing `requireRole` helpers in `role.middleware.ts` are not extended; they are not the pattern for new routes.
- Changing what a role may do means editing `auth/auth.permissions.ts` only.

## Considered options

- Own middleware that compares role names per route: rejected because it duplicates the permission table and ignores multi-role resolution.
