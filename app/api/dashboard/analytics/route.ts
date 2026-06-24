import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { todayInIST } from '@/lib/chatbot';
import {
  aggregateLostFactors,
  aggregateStatusCounts,
  buildMonthList,
  filterRowsByMonth,
  type LeadAnalyticsRow,
} from '@/lib/analytics';

// Always read live from the DB — never statically prerender this route.
export const dynamic = 'force-dynamic';

/**
 * Lead analytics feed for the /analytics pie charts.
 *
 * GET /api/dashboard/analytics?month=MM
 *   • `month` (optional, "01"…"12") filters BOTH charts by the leads'
 *     Asia/Kolkata creation month-of-year, regardless of year. Missing/invalid
 *     → defaults to the current IST month. The year is deliberately ignored so
 *     the chart stays meaningful across build years.
 *   → {
 *       month:        string,                                // effective month, "MM"
 *       months:       string[],                              // selectable months "01".."12"
 *       lostFactors:  { factor: string; count: number }[],  // ALL 10, fixed order, incl 0
 *       statusCounts: { status: string; count: number }[],  // New, Active, Progress, Successful
 *       totalLost:    number
 *     }
 *
 * Reads live from the `leads` table in ONE query on every request so the daily
 * classifier updates appear automatically as the page polls. The pure
 * aggregation/month helpers live in lib/analytics.ts (Next.js route modules may
 * not export extra names). Service-role only (lib/supabase.ts). Protected by
 * middleware.
 */

const MONTH_RE = /^(0[1-9]|1[0-2])$/;

export async function GET(req: Request): Promise<NextResponse> {
  // Current IST month-of-year ("01".."12") — the YYYY-MM-DD iso, chars 5–7.
  const currentMonth = todayInIST().iso.slice(5, 7);

  const requested = new URL(req.url).searchParams.get('month');
  const effectiveMonth = requested && MONTH_RE.test(requested) ? requested : currentMonth;

  const { data, error } = await supabase
    .from('leads')
    .select('lead_status, lead_lost_factor, created_at');

  if (error) {
    return NextResponse.json(
      { error: `Failed to fetch analytics: ${error.message}` },
      { status: 500 },
    );
  }

  const rows = (data as LeadAnalyticsRow[]) ?? [];
  const months = buildMonthList();

  const filtered = filterRowsByMonth(rows, effectiveMonth);
  const lostRows = filtered.filter((r) => r.lead_status === 'Lost');

  const lostFactors = aggregateLostFactors(lostRows);
  const statusCounts = aggregateStatusCounts(filtered);
  const totalLost = lostRows.length;

  return NextResponse.json(
    { month: effectiveMonth, months, lostFactors, statusCounts, totalLost },
    { status: 200 },
  );
}
