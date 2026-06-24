import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Always read live from the DB — never statically prerender this route.
// Without this, Next.js captures a build-time snapshot (empty) and the chat
// list never updates.
export const dynamic = 'force-dynamic';

/**
 * Conversation list for the dashboard left panel.
 *
 * GET /api/chats
 *
 * Returns each lead joined to its most recent message text, ordered by
 * last_message_at desc. needs_attention is derived as
 * (last_message_direction = 'inbound' AND ai_mode = false).
 *
 * The browser polls this on a short interval. Protected by middleware.
 */

interface LeadRow {
  phone: string;
  full_name: string | null;
  ai_mode: boolean | null;
  conversation_status: string | null;
  lead_status: string | null;
  lead_reason: string | null;
  last_message_at: string | null;
  last_message_direction: string | null;
}

interface LatestMessageRow {
  phone: string;
  content: string | null;
  created_at: string;
}

export async function GET(): Promise<NextResponse> {
  // 1. Fetch all leads ordered by recency.
  const { data: leads, error: leadsErr } = await supabase
    .from('leads')
    .select(
      'phone, full_name, ai_mode, conversation_status, lead_status, lead_reason, last_message_at, last_message_direction',
    )
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (leadsErr) {
    return NextResponse.json(
      { error: `Failed to fetch leads: ${leadsErr.message}` },
      { status: 500 },
    );
  }

  const leadRows = (leads as LeadRow[]) ?? [];
  if (leadRows.length === 0) {
    return NextResponse.json([], { status: 200 });
  }

  // 2. Fetch the latest message content per phone. We pull recent messages
  //    for the relevant phones and keep the newest per phone in JS — this
  //    avoids a non-portable lateral join while staying correct.
  const phones = leadRows.map((l) => l.phone);
  const { data: msgs, error: msgErr } = await supabase
    .from('messages')
    .select('phone, content, created_at')
    .in('phone', phones)
    .order('created_at', { ascending: false });

  if (msgErr) {
    return NextResponse.json(
      { error: `Failed to fetch messages: ${msgErr.message}` },
      { status: 500 },
    );
  }

  const latestByPhone = new Map<string, LatestMessageRow>();
  for (const m of (msgs as LatestMessageRow[]) ?? []) {
    if (!latestByPhone.has(m.phone)) {
      latestByPhone.set(m.phone, m);
    }
  }

  // 3. Shape the response.
  const chats = leadRows.map((l) => {
    const latest = latestByPhone.get(l.phone);
    const needsAttention =
      l.last_message_direction === 'inbound' && l.ai_mode === false;
    return {
      phone: l.phone,
      full_name: l.full_name,
      ai_mode: l.ai_mode ?? true,
      conversation_status: l.conversation_status ?? 'open',
      lead_status: l.lead_status ?? 'New',
      lead_reason: l.lead_reason ?? null,
      last_message: latest?.content ?? null,
      last_message_at: l.last_message_at,
      last_message_direction: l.last_message_direction,
      needs_attention: needsAttention,
    };
  });

  return NextResponse.json(chats, { status: 200 });
}
