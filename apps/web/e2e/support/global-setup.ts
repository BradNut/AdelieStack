import { createServer, type Server } from 'node:http';
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

export default async function globalSetup() {
  if (await mailpitIsUp()) return;
  const server = await startMailpitStub(Number(new URL(MAILPIT_URL).port));
  return () => {
    server.close();
  };
}
