import 'varlock/auto-load';
import './instrument.mjs';
import 'dotenv/config';
import { serve } from '@hono/node-server';
import { app } from './lib/server/api';

const port = Number(process.env.PORT ?? 3001);
const hostname = process.env.HOST ?? '0.0.0.0';

const appInstance = await app;

serve(
  {
    fetch: appInstance.fetch,
    port,
    hostname,
  },
  (info: { port: number; address: string }) => {
    console.log(`API server listening on http://${hostname}:${info.port}`);
  },
);
