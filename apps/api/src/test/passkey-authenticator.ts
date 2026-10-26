import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';

const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest();
const base64url = (data: Buffer) => data.toString('base64url');

/** The passkey row Better Auth stores for a registered credential. */
export interface StoredPasskey {
  id: string;
  name: string;
  userId: string;
  credentialID: string;
  publicKey: string;
  counter: number;
  deviceType: string;
  backedUp: boolean;
  transports: string;
  createdAt: Date;
}

/**
 * A software authenticator: one ES256 credential that signs WebAuthn assertions, so passkey sign-in can be
 * tested end to end without a browser. `passkeyFor` gives the row registration would have stored.
 */
export function createPasskeyAuthenticator({ rpID, origin }: { rpID: string; origin: string }) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const credentialID = base64url(randomBytes(16));
  let counter = 0;

  // COSE_Key map {1: 2 (EC2), 3: -7 (ES256), -1: 1 (P-256), -2: x, -3: y} in CBOR.
  const coseKey = Buffer.concat([
    Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]),
    Buffer.from(jwk.x ?? '', 'base64url'),
    Buffer.from([0x22, 0x58, 0x20]),
    Buffer.from(jwk.y ?? '', 'base64url'),
  ]);

  return {
    passkeyFor(userId: string): StoredPasskey {
      return {
        id: base64url(randomBytes(8)),
        name: 'Test key',
        userId,
        credentialID,
        publicKey: coseKey.toString('base64'),
        counter: 0,
        deviceType: 'singleDevice',
        backedUp: false,
        transports: 'internal',
        createdAt: new Date(),
      };
    },
    /** The browser's answer to `/passkey/generate-authenticate-options`, signed with this credential. */
    assert(challenge: string) {
      counter += 1;
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin, crossOrigin: false }));
      const counterBytes = Buffer.alloc(4);
      counterBytes.writeUInt32BE(counter);
      // rpIdHash, flags (user present and verified), signature counter.
      const authenticatorData = Buffer.concat([sha256(rpID), Buffer.from([0x05]), counterBytes]);
      const signature = sign('sha256', Buffer.concat([authenticatorData, sha256(clientDataJSON)]), privateKey);
      return {
        id: credentialID,
        rawId: credentialID,
        type: 'public-key',
        response: {
          clientDataJSON: base64url(clientDataJSON),
          authenticatorData: base64url(authenticatorData),
          signature: base64url(signature),
        },
        clientExtensionResults: {},
      };
    },
  };
}
