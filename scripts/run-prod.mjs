/**
 * One-command production launcher for 24/7 running.
 *
 *   npm run prod
 *
 * What it does, reliably, every time:
 *   1. Forces NODE_ENV=production and NEXT_DIST_DIR=.next-prod so the
 *      production build lives in its OWN folder, completely separate from the
 *      dev server's `.next`. This permanently prevents the
 *      "Cannot find module './###.js'" stale-chunk error.
 *   2. Runs `next build` into .next-prod.
 *   3. Starts the always-on custom server (server.ts) which bootstraps the
 *      cron jobs and then listens. dev=false because NODE_ENV=production.
 *
 * Because dev (`.next`) and prod (`.next-prod`) never share a directory, you
 * can run `npm run dev` and `npm run prod` independently without either one
 * ever corrupting the other.
 */
import { spawn, spawnSync } from 'node:child_process';

const env = {
  ...process.env,
  NODE_ENV: 'production',
  NEXT_DIST_DIR: '.next-prod',
};

console.log('[prod] building (NEXT_DIST_DIR=.next-prod) …');
const build = spawnSync('npx', ['next', 'build'], {
  stdio: 'inherit',
  env,
  shell: true,
});
if (build.status !== 0) {
  console.error('[prod] build failed — not starting the server.');
  process.exit(build.status ?? 1);
}

console.log('[prod] build OK — starting always-on server …');
const server = spawn('npx', ['tsx', 'server.ts'], {
  stdio: 'inherit',
  env,
  shell: true,
});

// Forward termination so Ctrl+C / process managers stop the server cleanly.
const stop = () => {
  if (!server.killed) server.kill('SIGINT');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('exit', (code) => process.exit(code ?? 0));
