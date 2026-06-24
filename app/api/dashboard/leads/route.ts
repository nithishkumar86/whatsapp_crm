import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { todayInIST } from '@/lib/chatbot';

// Always read live from the DB — never statically prerender this route.
export const dynamic = 'force-dynamic';

/**
 * Admin dashboard leads list, filtered by lead status (or "today"/"all").
 *
 * GET /api/dashboard/leads?filter=all|today|New|Active|Progress|Lost|Successful
 *
 * Status filters use the stored Title-case values enforced by the DB CHECK
 * (New/Active/Progress/Lost/Successful) — NOT all-caps. `today` filters on the
 * Asia/Kolkata midnight boundary. `all` (default for any unknown value)
 * returns every lead ordered by created_at desc.
 *
 * Service-role only (lib/supabase.ts). Protected by middleware.
 */

const STATUS_FILTERS = ['New', 'Active', 'Progress', 'Lost', 'Successful'] as const;
const ALLOWED_FILTERS = ['all', 'today', ...STATUS_FILTERS] as const;
type Filter = (typeof ALLOWED_FILTERS)[number];

// Full column set so /dashboard/leads and /dashboard/today can show the entire
// leads table. Other dashboard filters render only a subset of these and simply
// ignore the extra fields — their behavior is unchanged.
const SELECT_COLS =
  'phone, full_name, email, land_size, land_location, street_address, ' +
  'is_decision_maker, owns_land_chennai, project_start_date, budget, ' +
  'location_preference, lead_status, ai_mode, conversation_status, assigned_to, ' +
  'last_inbound_at, last_outbound_at, last_message_at, last_message_direction, ' +
  'created_at, updated_at, lead_reason, last_classified_at, lead_lost_factor';

// Safety cap so the table never pulls an unbounded result set as the lead
// database grows. The newest 500 leads (per filter) are returned.
const MAX_ROWS = 500;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const raw = req.nextUrl.searchParams.get('filter');
  // Validate against the allow-list; anything unknown falls back to 'all'.
  const filter: Filter = (ALLOWED_FILTERS as readonly string[]).includes(raw ?? '')
    ? (raw as Filter)
    : 'all';

  let query = supabase
    .from('leads')
    .select(SELECT_COLS)
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS);

  if (filter === 'today') {
    // IST midnight boundary, consistent with the Asia/Kolkata cron timezone.
    const { iso } = todayInIST();
    query = query.gte('created_at', `${iso}T00:00:00+05:30`);
  } else if (filter !== 'all') {
    query = query.eq('lead_status', filter);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: `Failed to fetch leads: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json(data ?? [], { status: 200 });
}
