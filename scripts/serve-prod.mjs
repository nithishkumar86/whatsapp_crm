/**
 * Instant production start — NO rebuild.
 *
 *   npm run serve
 *
 * Unlike `npm run prod` (which runs a full `next build` first, ~1–2 min, and
 * only then starts listening), this just launches the already-built server.
 * Use it for fast (re)starts when the code hasn't changed:
 *
 *   npm run prod    # build into .next-prod, then serve  (run once after edits)
 *   npm run serve   # serve the existing .next-prod build (instant restarts)
 *
 * It sets the same NEXT_DIST_DIR=.next-prod + NODE_ENV=production so the custom
 * server (server.ts, dev=false) reads the production build folder, keeping dev
 * (`.next`) and prod (`.next-prod`) completely separate.
 *
 * If no production build exists yet, it tells you to run `npm run prod` first
 * rather than silently falling back to an on-demand (slow) dev compile.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const DIST_DIR = '.next-prod';

if (!existsSync(`${DIST_DIR}/BUILD_ID`)) {
  console.error(
    `[serve] No production build found in ${DIST_DIR}/.\n` +
      `[serve] Run "npm run prod" once to build, then "npm run serve" for instant restarts.`,
  );
  process.exit(1);
}

const env = {
  ...process.env,
  NODE_ENV: 'production',
  NEXT_DIST_DIR: DIST_DIR,
};

console.log(`[serve] starting always-on server from ${DIST_DIR} (no rebuild) …`);
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
