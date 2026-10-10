import { createHmac } from 'node:crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input: string): Buffer {
  let bits = '';
  for (const char of input.replace(/=+$/, '')) bits += BASE32.indexOf(char).toString(2).padStart(5, '0');
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((b) => Number.parseInt(b, 2)));
}

/** RFC 6238 SHA-1, 6 digits, 30s step: what an authenticator app computes from the enrolment URI. */
export function totpCode(totpURI: string, offsetSteps = 0): string {
  const secret = base32Decode(new URL(totpURI).searchParams.get('secret') ?? '');
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offsetSteps));
  const hmac = createHmac('sha1', secret).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const value = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 1_000_000).padStart(6, '0');
}
