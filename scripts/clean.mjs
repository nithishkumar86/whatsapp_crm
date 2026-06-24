/**
 * One-command recovery. If anything ever looks wrong (e.g. a stale
 * "Cannot find module './###.js'"), run:
 *
 *   npm run clean
 *
 * It deletes every build cache. The next `npm run dev` or `npm run prod`
 * rebuilds from scratch. This is always safe — build caches are regenerated.
 */
import { rmSync } from 'node:fs';

for (const dir of ['.next', '.next-prod', '.next-check']) {
  try {
    rmSync(dir, { recursive: true, force: true });
    console.log(`[clean] removed ${dir}`);
  } catch {
    /* not present — fine */
  }
}
console.log('[clean] done — `npm run dev` / `npm run prod` will rebuild fresh.');
