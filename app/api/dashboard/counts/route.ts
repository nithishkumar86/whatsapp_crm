import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { todayInIST } from '@/lib/chatbot';

// Always read live from the DB — never statically prerender this route.
export const dynamic = 'force-dynamic';

/**
 * Lightweight lead feed for the admin dashboard sidebar's notification badges.
 *
 * GET /api/dashboard/counts
 *   → { todayBoundaryMs, leads: [{ phone, lead_status, created_at, updated_at }] }
 *
 * The sidebar no longer shows total counts. Instead each icon shows a
 * phone-style "unseen" badge: the number of leads that became relevant to that
 * view since the admin last opened it (tracked client-side in localStorage).
 * To compute that, the client needs the per-lead timestamps + status, so we
 * return a compact row per lead (newest activity first, capped) plus the
 * Asia/Kolkata "today" boundary for the Today view.
 *
 * Service-role only (lib/supabase.ts). Protected by middleware.
 */

// Unseen items are always recent, so the most-recently-updated slice is enough
// to cover every badge while keeping the polled payload bounded.
const MAX_ROWS = 500;

interface LeadFeedRow {
  phone: string;
  lead_status: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export async function GET(): Promise<NextResponse> {
  const { data, error } = await supabase
    .from('leads')
    .select('phone, lead_status, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(MAX_ROWS);

  if (error) {
    return NextResponse.json(
      { error: `Failed to fetch counts: ${error.message}` },
      { status: 500 },
    );
  }

  const { iso } = todayInIST();
  const todayBoundaryMs = new Date(`${iso}T00:00:00+05:30`).getTime();

  return NextResponse.json(
    { todayBoundaryMs, leads: (data as LeadFeedRow[]) ?? [] },
    { status: 200 },
  );
}
