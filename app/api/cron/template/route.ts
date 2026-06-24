import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Always read live from the DB — never statically prerender this route.
export const dynamic = 'force-dynamic';

/**
 * Per-lead template-message log.
 *
 * GET /api/cron/template
 *
 * Returns every template_messages row (one per lead that has ever been sent a
 * WhatsApp template), ordered newest `last_sent_at` first (nulls last), with the
 * lead's `full_name` merged in from the `leads` table. The full_name merge is
 * done with two queries + a JS map — we do NOT rely on PostgREST embedding.
 *
 * Service-role only (lib/supabase.ts). Protected by middleware.
 */
export async function GET(): Promise<NextResponse> {
  const { data: tmpl, error } = await supabase
    .from('template_messages')
    .select('phone, template_sent, template_name, total_template_sent, last_sent_at')
    .order('last_sent_at', { ascending: false, nullsFirst: false });

  if (error) {
    return NextResponse.json(
      { error: `Failed to fetch template messages: ${error.message}` },
      { status: 500 },
    );
  }

  const rows = tmpl ?? [];
  if (rows.length === 0) {
    return NextResponse.json([], { status: 200 });
  }

  // Merge full_name from leads (two queries + JS map — no PostgREST embedding).
  const phones = rows.map((r) => r.phone);
  const { data: leads, error: leadErr } = await supabase
    .from('leads')
    .select('phone, full_name')
    .in('phone', phones);

  if (leadErr) {
    return NextResponse.json(
      { error: `Failed to fetch lead names: ${leadErr.message}` },
      { status: 500 },
    );
  }

  const nameByPhone = new Map<string, string | null>(
    (leads ?? []).map((l) => [l.phone as string, (l.full_name as string | null) ?? null]),
  );

  const merged = rows.map((r) => ({
    phone: r.phone,
    full_name: nameByPhone.get(r.phone) ?? null,
    template_sent: r.template_sent,
    template_name: r.template_name,
    total_template_sent: r.total_template_sent,
    last_sent_at: r.last_sent_at,
  }));

  return NextResponse.json(merged, { status: 200 });
}
