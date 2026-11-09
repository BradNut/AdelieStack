import 'varlock/auto-load';
import { flushTelemetry } from './instrument.mjs';
import 'dotenv/config';
import { serve } from '@hono/node-server';
import { startServer } from './lib/server/api';

const port = Number(process.env.PORT ?? 3001);
const hostname = process.env.HOST ?? '0.0.0.0';

const { app, handleShutdownSignals } = await startServer();

const server = serve(
  {
    fetch: app.fetch,
    port,
    hostname,
  },
  (info: { port: number; address: string }) => {
    console.log(`API server listening on http://${hostname}:${info.port}`);
  },
);

handleShutdownSignals({ server, flushTelemetry });
