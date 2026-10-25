import { describe, expect, it } from 'vitest';
import { publicId, uuidv7 } from '#lib/server/api/common/utils/crypto';

const PUBLIC_ID_PATTERN = /^[0-9A-Za-z]{21}$/;
const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Reads the 48-bit unix-ms timestamp back out of a UUIDv7 string. */
function timestampOf(id: string): number {
  return Number.parseInt(id.replaceAll('-', '').slice(0, 12), 16);
}

describe('uuidv7', () => {
  it('returns an RFC 9562 version 7 uuid with the variant bits set', () => {
    expect(uuidv7()).toMatch(UUID_V7_PATTERN);
  });

  it('encodes the given unix-ms timestamp in the first 48 bits', () => {
    const now = Date.UTC(2026, 9, 9, 12, 0, 0, 123);

    expect(timestampOf(uuidv7(now))).toBe(now);
  });

  it('encodes the maximum 48-bit timestamp without overflow', () => {
    const max = 2 ** 48 - 1;

    expect(uuidv7(max).startsWith('ffffffff-ffff-7')).toBe(true);
  });

  it('sorts lexicographically by creation time', () => {
    const earlier = uuidv7(1_000);
    const later = uuidv7(2_000);

    expect([later, earlier].sort()).toEqual([earlier, later]);
  });

  it('returns a different id on each call within the same millisecond', () => {
    const now = Date.now();
    const ids = new Set(Array.from({ length: 1_000 }, () => uuidv7(now)));

    expect(ids.size).toBe(1_000);
  });
});

describe('publicId', () => {
  it('returns exactly 21 characters', () => {
    expect(publicId()).toHaveLength(21);
  });

  it('uses only the characters 0-9, A-Z and a-z', () => {
    for (let i = 0; i < 100; i++) {
      expect(publicId()).toMatch(PUBLIC_ID_PATTERN);
    }
  });

  it('returns no repeats across 1,000 calls', () => {
    const ids = new Set(Array.from({ length: 1_000 }, () => publicId()));

    expect(ids.size).toBe(1_000);
  });

  it('carries no creation time: back-to-back ids share no prefix and are not ordered by creation', () => {
    const ids = Array.from({ length: 1_000 }, () => publicId());

    // A time-derived prefix (as in uuidv7) would make consecutive ids share leading characters.
    const sharedPrefixes = ids.slice(1).filter((id, i) => id.slice(0, 4) === ids[i].slice(0, 4));
    expect(sharedPrefixes.length).toBeLessThan(5);
    // Creation order is not sort order.
    expect([...ids].sort()).not.toEqual(ids);
  });
});
