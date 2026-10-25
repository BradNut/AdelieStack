---
status: accepted
---

# Public Ids are nanoid, not cuid2 or UUIDs

Any identifier that leaves the system (URLs, UI, cookie values, object-storage keys, request ids) is a nanoid made by the server's `publicId()`: 21 characters from a 62-character alphanumeric alphabet, about 125 bits of CSPRNG randomness with no timestamp. Row Ids stay UUIDv7 ([ADR 0010](./0010-auth-ids-stay-text-uuidv7.md)), but RFC 9562 says UUIDs are not secrets and a v7 shows when it was created. A public-bucket storage key is the only thing that keeps a file from anyone who guesses its URL, so Public Ids must be unguessable and must not reveal time.

## Consequences

- Only the API creates Public Ids. The client has no id helper; a local key can use `crypto.randomUUID()`.
- Better Auth never sees nanoid: its ids come from `generateAuthId` (UUIDv7).
- Public Ids made before the switch from 16 to 21 characters stay valid. Nothing parses their length.

## Considered options

- cuid2: also unguessable and timestamp-free, but slower on purpose (it hashes) and an extra dependency, for nothing nanoid lacks. Rejected.
- UUIDv7: reveals creation time and is not meant to be a secret. Rejected.
- UUIDv4: unguessable, but longer as text and offers nothing over nanoid, which was already a dependency. Rejected.
