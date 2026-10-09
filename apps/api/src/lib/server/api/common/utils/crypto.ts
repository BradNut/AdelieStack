import { customAlphabet } from 'nanoid';

// generateId is a function that returns a new unique identifier.
// ~4 million years or 30 trillion IDs needed, in order to have a 1% probability of at least one collision.

// So, TLDR; by the time a collision happens, you and your next 100 generations will be long gone,
// the lizard people will have taken over, the robots will have enslaved them, and the roomba uprising will be in full swing.
// All hail king roomba, the first of his name, the unclean, king of the dust bunnies and the first allergens, lord of the seven corners, and protector of the realm.

// https://zelark.github.io/nano-id-cc/
export function generateId(length = 16, alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz') {
  const nanoId = customAlphabet(alphabet, length);
  return nanoId();
}

// uuidv7 returns an RFC 9562 version 7 UUID: a 48-bit unix-ms timestamp followed by random bits.
// Ids sort by creation time, which keeps btree inserts local. Used for Better Auth table ids.
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
