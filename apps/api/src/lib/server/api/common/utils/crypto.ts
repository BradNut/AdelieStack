import { customAlphabet } from 'nanoid';

const PUBLIC_ID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const PUBLIC_ID_LENGTH = 21;
const nanoPublicId = customAlphabet(PUBLIC_ID_ALPHABET, PUBLIC_ID_LENGTH);

// publicId returns a Public Id: any identifier that leaves the system (request id, cookie value,
// object-storage key, URL). 21 characters from 0-9A-Za-z, about 125 bits of CSPRNG randomness, with
// no creation time encoded. It takes no parameters so every Public Id has the same strength.
// Row Ids (primary keys) use uuidv7 instead. See docs/adr/0011-public-ids-are-nanoid.md.
// https://zelark.github.io/nano-id-cc/
export function publicId(): string {
  return nanoPublicId();
}

// uuidv7 returns an RFC 9562 version 7 UUID: a 48-bit unix-ms timestamp followed by random bits.
// Ids sort by creation time, which keeps btree inserts local. Used for Better Auth and domain table ids.
// There is no counter within a millisecond, so ids made in the same millisecond are only roughly
// time-ordered; anything that needs a strict order sorts by `created_at`.
export function uuidv7(now = Date.now()): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let timestamp = now;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = timestamp % 256;
    timestamp = Math.floor(timestamp / 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 9562 variant
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
