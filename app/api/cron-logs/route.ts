import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Always read live from the DB — never statically prerender this route.
export const dynamic = 'force-dynamic';

/**
 * Cron execution logs for the Crons tab.
 *
 * GET /api/cron-logs — ordered by ran_at desc.
 *
 * Protected by session middleware.
 */

export async function GET(): Promise<NextResponse> {
  const { data, error } = await supabase
    .from('cron_logs')
    .select('id, cron_name, status, messages_sent, error_message, ran_at')
    .order('ran_at', { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json(
      { error: `Failed to fetch cron logs: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json(data ?? [], { status: 200 });
}
