/** @type {import('next').NextConfig} */
const nextConfig = {
  // NOTE: 'output: standalone' is intentionally NOT set. This app ships a
  // custom always-on server (server.ts) that bootstraps the cron jobs before
  // listening. Next's standalone output is incompatible with a custom server:
  // it generates its own .next/standalone/server.js (which would NOT run our
  // crons), and running our custom server against a standalone build breaks
  // webpack chunk resolution ("Cannot find module './###.js'") so every route
  // 500s. A normal production build + `tsx server.ts` runs perfectly on any
  // always-on host (VM, Docker, Railway, Render, ECS) and keeps the crons.
  //
  // Build-dir separation: `npm run dev` uses the default `.next`, while the
  // production workflow (npm run prod) sets NEXT_DIST_DIR=.next-prod so the dev
  // and production builds NEVER share a folder. This permanently prevents the
  // "Cannot find module './###.js'" stale-chunk error that happens when dev and
  // build write to the same `.next`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
};

export default nextConfig;
