import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Always read live from the DB — never statically prerender this route.
export const dynamic = 'force-dynamic';

/**
 * Daily-reminder PERMANENT CRON RUN-LOG.
 *
 * GET /api/cron/dailyremin
 *
 * Returns only appointments that Cron 2 (tomorrow_reminder, 8:00 AM IST) has
 * actually PROCESSED — i.e. `reminder_1day_run_at` is set — regardless of
 * whether the send succeeded or failed. Rows are ordered newest-run-first and
 * persist forever. Cancelled appointments are excluded.
 *
 * Service-role only (lib/supabase.ts). Protected by middleware.
 */
export async function GET(): Promise<NextResponse> {
  const { data, error } = await supabase
    .from('appointments')
    .select(
      'phone, full_name, visit_date, visit_time, location_preference, status, reminder_1day_run_at, reminder_1day_result',
    )
    .not('reminder_1day_run_at', 'is', null)
    .neq('status', 'cancelled')
    .order('reminder_1day_run_at', { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: `Failed to fetch reminders: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json(data ?? [], { status: 200 });
}
