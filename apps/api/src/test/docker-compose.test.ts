import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// Local infra must be reachable only from the developer machine (#235): no host networking (which also
// makes Compose ignore `ports:`), and every published port bound to the loopback address.
const LOOPBACK_HOST_IPS = new Set(['127.0.0.1', '::1']);

type ComposePort = string | number | { host_ip?: string; published?: string | number; target?: string | number };
type ComposeService = { network_mode?: string; ports?: ComposePort[] };
type ComposeFile = { services?: Record<string, ComposeService> };

// Host IP of a short-syntax port ("[HOST_IP:]HOST_PORT:CONTAINER_PORT[/PROTOCOL]"), or undefined when none is set.
function shortSyntaxHostIp(port: string): string | undefined {
  const spec = port.replace(/\/\w+$/, '');
  const bracketed = spec.match(/^\[([^\]]+)\]:/);
  if (bracketed) return bracketed[1];
  const parts = spec.split(':');
  return parts.length === 3 ? parts[0] : undefined;
}

function findNetworkExposures(compose: ComposeFile): string[] {
  const exposures: string[] = [];
  for (const [name, service] of Object.entries(compose.services ?? {})) {
    if (service.network_mode === 'host') exposures.push(`${name}: network_mode host`);
    for (const port of service.ports ?? []) {
      const hostIp = typeof port === 'object' ? port.host_ip : shortSyntaxHostIp(String(port));
      if (!hostIp || !LOOPBACK_HOST_IPS.has(hostIp)) {
        exposures.push(`${name}: port ${JSON.stringify(port)} is not bound to loopback`);
      }
    }
  }
  return exposures;
}

describe('docker-compose.yaml', () => {
  const composePath = fileURLToPath(new URL('../../../../docker-compose.yaml', import.meta.url));
  const compose = parse(readFileSync(composePath, 'utf8')) as ComposeFile;

  it('publishes services only on the loopback address and never uses host networking', () => {
    expect(Object.keys(compose.services ?? {})).not.toHaveLength(0);
    expect(findNetworkExposures(compose)).toEqual([]);
  });

  it('keeps the host ports the app and scripts connect to', () => {
    const published = Object.values(compose.services ?? {}).flatMap((service) => (service.ports ?? []).map((port) => String(port)));
    // Postgres, Redis, SeaweedFS S3, Mailpit SMTP + UI, Spotlight, OTLP HTTP, clamd.
    for (const hostPort of ['5432', '6379', '8333', '1025', '8025', '8969', '4318', '3310']) {
      expect(published).toContain(`127.0.0.1:${hostPort}:${hostPort}`);
    }
  });
});

describe('findNetworkExposures', () => {
  const withPorts = (...ports: ComposePort[]): ComposeFile => ({ services: { svc: { ports } } });

  it('accepts loopback-bound short and long syntax ports', () => {
    expect(
      findNetworkExposures(
        withPorts('127.0.0.1:5432:5432', '127.0.0.1:4317:4317/tcp', '[::1]:6379:6379', { target: 80, published: 8080, host_ip: '127.0.0.1' }),
      ),
    ).toEqual([]);
  });

  it('accepts a service with no published ports', () => {
    expect(findNetworkExposures({ services: { worker: {} } })).toEqual([]);
  });

  it('flags host networking', () => {
    expect(findNetworkExposures({ services: { db: { network_mode: 'host' } } })).toEqual(['db: network_mode host']);
  });

  it('flags ports published on every interface', () => {
    expect(findNetworkExposures(withPorts('5432:5432', '8025', 1025, '0.0.0.0:6379:6379', '[::]:9000:9000'))).toHaveLength(5);
  });

  it('flags long syntax ports without a loopback host_ip', () => {
    expect(findNetworkExposures(withPorts({ target: 80, published: 8080 }, { target: 80, published: 8081, host_ip: '0.0.0.0' }))).toHaveLength(2);
  });
});
