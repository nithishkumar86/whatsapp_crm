/**
 * Safe pre-flight check — run this after ANY edit, before trusting it.
 *
 *   npm run check
 *
 * It does two things and tells you PASS/FAIL in plain language:
 *   1. TypeScript typecheck (tsc --noEmit) — catches type/usage errors.
 *   2. A real production build into an ISOLATED .next-check folder — catches
 *      anything that would break the actual site.
 *
 * It NEVER touches your dev (`.next`) or prod (`.next-prod`) folders, so running
 * it can't disturb a running app. If it says ALL GOOD, `npm run prod` is safe.
 */
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';

function run(cmd, args, extraEnv) {
  return spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...extraEnv },
  });
}

console.log('\n[check] 1/2  TypeScript typecheck …');
let r = run('npx', ['tsc', '--noEmit']);
if (r.status !== 0) {
  console.error(
    '\n[check] ❌ TYPECHECK FAILED. Fix the errors above.\n' +
      '         Your running app is NOT affected — nothing was changed.\n',
  );
  process.exit(1);
}

console.log('\n[check] 2/2  Production build (isolated in .next-check) …');
r = run('npx', ['next', 'build'], {
  NODE_ENV: 'production',
  NEXT_DIST_DIR: '.next-check',
});
try {
  rmSync('.next-check', { recursive: true, force: true });
} catch {
  /* best-effort cleanup */
}

if (r.status !== 0) {
  console.error(
    '\n[check] ❌ BUILD FAILED. See the errors above.\n' +
      '         Your running app is NOT affected — nothing was changed.\n',
  );
  process.exit(1);
}

console.log(
  '\n[check] ✅ ALL GOOD — typecheck + build both pass.\n' +
    '         This edit is safe. Run `npm run prod` to deploy it.\n',
);
