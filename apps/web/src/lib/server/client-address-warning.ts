import { AUTH_CLIENT_IP_HEADER } from '@adelie/shared/constants';
import { ADDRESS_HEADER } from '$app/env/private';

/** Headers a reverse proxy sets to say who the client is. */
const FORWARDING_HEADERS = [AUTH_CLIENT_IP_HEADER, 'x-real-ip', 'cf-connecting-ip', 'forwarded'] as const;

let warned = false;

/**
 * Warns once per process when a proxy sits in front of the web tier but adapter-node has not been told which header holds
 * the client address: every client then reaches the API with the proxy's address and shares its rate-limit buckets.
 * Names the headers only: their values are client-influenced.
 */
export function warnIfClientAddressUnconfigured(headers: Headers): void {
  if (warned || ADDRESS_HEADER) return;

  const present = FORWARDING_HEADERS.filter((header) => headers.has(header));
  if (present.length === 0) return;

  warned = true;
  console.warn(
    `Request carries forwarding headers (${present.join(', ')}) but ADDRESS_HEADER is unset, so clients behind the proxy share its address and its rate-limit buckets. Set ADDRESS_HEADER as the web deployment runbook describes.`,
  );
}
