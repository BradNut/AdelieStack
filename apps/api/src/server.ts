import { serve } from '@hono/node-server';
import { startServer } from './lib/server/api';

const app = await startServer();
const port = Number(process.env.PORT ?? 3001);

serve({
  fetch: app.fetch,
  port
});
