import { createHmac } from 'node:crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;

function base32Decode(input: string): Buffer {
  let bits = '';
  for (const char of input.replace(/=+$/, '')) bits += BASE32.indexOf(char).toString(2).padStart(5, '0');
  return Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2)));
}

/** RFC 6238 SHA-1, 6 digits: the code an authenticator app shows for an `otpauth://` URI. */
export function totpCode(totpURI: string, offsetSteps = 0): string {
  const secret = base32Decode(new URL(totpURI).searchParams.get('secret') ?? '');
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / STEP_SECONDS) + offsetSteps));
  const hmac = createHmac('sha1', secret).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
