---

## status: accepted

# Valkey replaces Redis as the key-value store

The key-value store behind rate-limit counters (our Hono `rateLimit()` and Better Auth's `customStorage`, see [ADR 0006](./0006-better-auth-owns-auth-rate-limiting.md)) and BullMQ job queues is Valkey, not Redis. Redis left open-source licensing (RSAL/SSPL, then AGPL from 8.0), while Valkey is BSD-3 under the Linux Foundation, so a template that others build on should not default to Redis Inc. software. Valkey speaks the same protocol, so only the server changes: the client stays `ioredis`, which BullMQ also uses internally, and code, config and tests are named after Valkey (`VALKEY_URL`, `ValkeyService`) so names match what runs.

## Consequences

- `REDIS_URL` becomes `VALKEY_URL`; deployments must rename the variable.
- Compose and CI pin the same exact Valkey 8 release (`valkey/valkey:8.1.12`), not the floating `:8` tag, which `scripts/check-pinned-refs.mjs` rejects; bump both together.
- `ioredis` remaining a dependency is deliberate, not a missed rename.

## Considered options

- Keep Redis: rejected for licensing.
- Keep the Redis names over a Valkey server, since they describe the protocol: rejected because the names would then contradict what runs.
- Vendor-neutral names (`KV_URL`, `KeyValueService`): rejected; a further swap is unlikely and "Valkey" is clearer to readers.
- `iovalkey` client: rejected because BullMQ still ships `ioredis`, so we would carry two near-identical clients.
- `@valkey/valkey-glide`: rejected as a rewrite BullMQ cannot share.
