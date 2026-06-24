// Load .env / .env.local BEFORE anything that reads process.env.
// next dev/build load these automatically, but a custom server started via
// `tsx server.ts` does not — so without this, modules like lib/supabase that
// read env at import time would throw "Missing env var" on boot.
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';

/**
 * Custom Next.js server — always-on Node process.
 *
 * This is the deployment entrypoint (`npm start` runs `tsx server.ts`). It must
 * NOT be deployed to a serverless platform: the cron jobs require a single
 * long-lived process. We load env, prepare the Next app, bootstrap the cron
 * schedules BEFORE the HTTP server starts listening, then hand every request
 * off to the Next request handler.
 *
 * lib/crons (which pulls in lib/supabase) is imported dynamically inside main()
 * so it evaluates AFTER loadEnvConfig() has populated process.env.
 */

const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT) || 3000;
const hostname = process.env.HOSTNAME || '0.0.0.0';

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

async function main(): Promise<void> {
  await app.prepare();

  // Imported here (not at top) so env is loaded before lib/supabase evaluates.
  const { bootstrapCrons } = await import('@/lib/crons');

  // Start cron schedules before we begin accepting requests.
  bootstrapCrons();

  const server = createServer((req, res) => {
    try {
      const parsedUrl = parse(req.url || '', true);
      handle(req, res, parsedUrl);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error handling request:', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  server.listen(port, hostname, () => {
    // The server binds to `hostname` (0.0.0.0 = all interfaces), but a browser
    // cannot open 0.0.0.0 — show the clickable localhost URL instead.
    const browserHost = hostname === '0.0.0.0' ? 'localhost' : hostname;
    // eslint-disable-next-line no-console
    console.log(`> Ready — open http://${browserHost}:${port} in your browser (dev=${dev})`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
