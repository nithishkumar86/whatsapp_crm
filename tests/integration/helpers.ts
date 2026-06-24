import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!url || !serviceKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment. ' +
    'Ensure .env.local (or DOTENV_CONFIG_PATH target) contains real values.'
  );
}

export const svc: SupabaseClient = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const anon: SupabaseClient | null = anonKey
  ? createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

/** Generate a unique sentinel phone number that will never collide with real leads. */
export function testPhone(): string {
  const rand = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, '0');
  return `+99TEST${Date.now()}${rand}`;
}

/**
 * Delete all rows tied to a sentinel phone number.
 * Children are removed first to respect FK constraints.
 * cron_logs and property_files have no phone column — delete those by captured id.
 */
export async function cleanup(phone: string): Promise<void> {
  await svc.from('template_messages').delete().eq('phone', phone);
  await svc.from('lead_events').delete().eq('phone', phone);
  await svc.from('appointments').delete().eq('phone', phone);
  await svc.from('messages').delete().eq('phone', phone);
  await svc.from('leads').delete().eq('phone', phone);
}

/** Delete a cron_logs row by its uuid. */
export async function cleanupCronLog(id: string): Promise<void> {
  await svc.from('cron_logs').delete().eq('id', id);
}

/** Delete a property_files row by its uuid. */
export async function cleanupPropertyFile(id: string): Promise<void> {
  await svc.from('property_files').delete().eq('id', id);
}
