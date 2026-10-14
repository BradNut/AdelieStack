# Local Form components instead of formsnap

Status: accepted (2026-10-13), revisit when formsnap's maintenance status is clear.

`apps/web/src/lib/components/ui/form` is built on superforms' `formFieldProxy` and the shadcn `Field` components. `formsnap` is not a dependency.

## Why

SvelteKit 3 removed `$app/stores`, so the app needs `sveltekit-superforms` 3. `formsnap` 2.0.1 peers on superforms `^2.19.0`, and against superforms 3 field errors never render. Upstream looks unmaintained: last commit April 2025, and [svecosystem/formsnap#234](https://github.com/svecosystem/formsnap/issues/234) (superforms 3 support) has had no response.

## Considered

`@emmorts/formsnap` 2.3.0, a fork that peers on superforms `^2.19.0 || ^3.0.0`. It is days old, has one maintainer and has not been tried here. Not adopted: it would put an unproven third-party dependency under every auth form, and the local components are about 150 lines.

## Check back

- Is `svecosystem/formsnap` active again, with superforms 3 support released?
- Has `@emmorts/formsnap` (or another fork) stayed maintained and become the community default?

If either is true, compare it against the local components. Switching means restoring formsnap-backed wrappers behind the same `Form.*` API, so call sites would not change.
