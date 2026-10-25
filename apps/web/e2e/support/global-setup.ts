import { createServer, type Server } from 'node:http';
import { connect } from 'node:net';
import { MAILPIT_URL } from './mailbox';

interface StoredMessage {
  ID: string;
  Subject: string;
  HTML: string;
  To: { Email: string }[];
}

/**
 * Minimal stand-in for the two Mailpit endpoints the app and the tests use: the send API and
 * message search/read. Only started when nothing is already listening on the Mailpit port.
 */
function startMailpitStub(port: number): Promise<Server> {
  const messages: StoredMessage[] = [];

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', MAILPIT_URL);
    const json = (body: unknown, status = 200) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (req.method === 'POST' && url.pathname === '/api/v1/send') {
      let raw = '';
      req.on('data', (chunk) => {
        raw += chunk;
      });
      req.on('end', () => {
        const body = JSON.parse(raw) as { Subject: string; HTML: string; To: { Email: string }[] };
        const message = { ID: String(messages.length + 1), Subject: body.Subject, HTML: body.HTML, To: body.To };
        messages.push(message);
        json({ ID: message.ID });
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/v1/search') {
      const to = /to:"?([^"\s]+)"?/.exec(url.searchParams.get('query') ?? '')?.[1];
      const found = messages.filter((m) => !to || m.To.some((t) => t.Email === to));
      json({ messages: found.map((m) => ({ ID: m.ID, Subject: m.Subject, To: m.To })) });
      return;
    }

    const read = /^\/api\/v1\/message\/(.+)$/.exec(url.pathname);
    if (req.method === 'GET' && read) {
      const message = messages.find((m) => m.ID === read[1]);
      json(message ? { ID: message.ID, Subject: message.Subject, HTML: message.HTML } : {}, message ? 200 : 404);
      return;
    }

    json({}, 404);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve(server));
  });
}

async function mailpitIsUp(): Promise<boolean> {
  try {
    await fetch(`${MAILPIT_URL}/api/v1/info`);
    return true;
  } catch {
    return false;
  }
}

function portIsOpen(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port, timeout: 2_000 });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });
}

/** Fails the run once, up front, instead of letting every flow time out against a missing database or Redis. */
async function assertInfraReady() {
  if (!process.env.ADMIN_PASSWORD) {
    throw new Error('ADMIN_PASSWORD is not set. Run e2e through `pnpm test:e2e`, which loads it from the API env.');
  }
  const redis = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  const services = [
    { name: 'Postgres', host: process.env.DATABASE_HOST ?? 'localhost', port: Number(process.env.DATABASE_PORT ?? 5432) },
    { name: 'Redis', host: redis.hostname, port: Number(redis.port || 6379) },
  ];
  const down = [];
  for (const service of services) {
    if (!(await portIsOpen(service.host, service.port))) down.push(`${service.name} (${service.host}:${service.port})`);
  }
  if (down.length > 0) {
    throw new Error(`Infra not running: ${down.join(', ')}. Start it with \`docker compose up -d\`, then \`pnpm db:migrate && pnpm db:seed\`.`);
  }
}

export default async function globalSetup() {
  await assertInfraReady();
  if (await mailpitIsUp()) return;
  const server = await startMailpitStub(Number(new URL(MAILPIT_URL).port));
  return () => {
    server.close();
  };
}
