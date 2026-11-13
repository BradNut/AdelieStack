import { randomBytes, type ScryptOptions, scrypt, timingSafeEqual } from 'node:crypto';
import { verifyPassword as verifyLegacyPassword } from 'better-auth/crypto';

/** scrypt's cost parameters: CPU/memory cost `N`, block size `r`, parallelism `p`. */
export interface ScryptCost {
  N: number;
  r: number;
  p: number;
}

/**
 * scrypt cost for new password hashes: one of the OWASP Password Storage Cheat Sheet's equivalent settings
 * (N=2^16, r=8, p=2), chosen over N=2^17, p=1 for half the memory per hash (64 MiB) at the same CPU cost.
 * Better Auth's default (N=2^14, r=16, p=1) falls short of it.
 */
export const PASSWORD_SCRYPT_COST: ScryptCost = { N: 2 ** 16, r: 8, p: 2 };

const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const PREFIX = '$scrypt$';
const PARAMS_PATTERN = /^n=(\d+),r=(\d+),p=(\d+)$/;
const HEX_PATTERN = /^(?:[0-9a-f]{2})+$/;

/** Hashes and checks account passwords; `needsRehash` tells a stored hash to replace at the next sign-in. */
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(input: { hash: string; password: string }): Promise<boolean>;
  needsRehash(hash: string): boolean;
}

function deriveKey(password: string, salt: string, cost: ScryptCost, keyLength: number): Promise<Buffer> {
  // Node refuses above 32 MiB by default; scrypt needs 128 * N * r bytes, so allow twice that.
  const options: ScryptOptions = { N: cost.N, r: cost.r, p: cost.p, maxmem: 2 * 128 * cost.N * cost.r };
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, keyLength, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

const formatParams = (cost: ScryptCost) => `n=${cost.N},r=${cost.r},p=${cost.p}`;

/** A `$scrypt$` hash taken apart: its cost, the cost as written (`n=..,r=..,p=..`), the salt (hex) and the derived key. */
interface ParsedHash {
  cost: ScryptCost;
  params: string;
  salt: string;
  key: Buffer;
}

/** Parses a `$scrypt$n=..,r=..,p=..$<salt hex>$<key hex>` hash; null when it is not in that format. */
function parseHash(hash: string): ParsedHash | null {
  if (!hash.startsWith(PREFIX)) return null;
  const [params, salt, key, ...rest] = hash.slice(PREFIX.length).split('$');
  const match = params?.match(PARAMS_PATTERN);
  if (!match || !salt || !key || rest.length > 0 || !HEX_PATTERN.test(salt) || !HEX_PATTERN.test(key)) return null;
  return { cost: { N: Number(match[1]), r: Number(match[2]), p: Number(match[3]) }, params, salt, key: Buffer.from(key, 'hex') };
}

/**
 * Password hashing with scrypt at `cost`, recorded in each hash so the cost can be raised later. A hash verifies at the
 * cost it records, and a `salt:key` hash Better Auth wrote at its default cost (before this hasher) still verifies; both
 * need a rehash. Tests pass a cheaper cost; everything else keeps {@link PASSWORD_SCRYPT_COST}.
 */
export function createPasswordHasher(cost: ScryptCost = PASSWORD_SCRYPT_COST): PasswordHasher {
  const currentParams = formatParams(cost);
  return {
    async hash(password) {
      const salt = randomBytes(SALT_BYTES).toString('hex');
      const key = await deriveKey(password, salt, cost, KEY_LENGTH);
      return `${PREFIX}${currentParams}$${salt}$${key.toString('hex')}`;
    },
    async verify({ hash, password }) {
      if (!hash.startsWith(PREFIX)) return verifyLegacyPassword({ hash, password });
      const parsed = parseHash(hash);
      if (!parsed) throw new Error('Invalid password hash');
      const key = await deriveKey(password, parsed.salt, parsed.cost, parsed.key.length);
      return timingSafeEqual(key, parsed.key);
    },
    needsRehash(hash) {
      return parseHash(hash)?.params !== currentParams;
    },
  };
}
