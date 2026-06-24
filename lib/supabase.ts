import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client using the SERVICE ROLE key.
 *
 * CRITICAL: This module must only ever be imported in server-side code
 * (API routes, webhooks, crons, server components). The service role key
 * bypasses Row Level Security and must NEVER reach the browser.
 *
 * The browser never talks to Supabase directly — all data access goes
 * through Next.js API routes that import this client.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing env var: NEXT_PUBLIC_SUPABASE_URL');
}

if (!serviceRoleKey) {
  throw new Error('Missing env var: SUPABASE_SERVICE_ROLE_KEY');
}

export const supabase: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  global: {
    // CRITICAL: Next.js patches global fetch and caches GET requests by
    // default. Without this, supabase-js GET queries with a constant URL
    // (e.g. the leads list) get served from a stale build-time cache and
    // never reflect new rows. Forcing `no-store` makes every DB read live.
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
  },
});
