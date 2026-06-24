import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendText } from '@/lib/whatsapp';

/**
 * Agent manual send.
 *
 * POST { phone, message }
 *   1. Send the text via WhatsApp Cloud API.
 *   2. Save the outbound message (sent_by='agent').
 *   3. Update lead outbound timestamps + last_message_direction='outbound'.
 *
 * Protected by session middleware (not a public webhook).
 */

interface SendBody {
  phone?: string;
  message?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  if (!phone) {
    return NextResponse.json({ error: 'phone is required' }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  // Ensure the lead exists — FK on messages.phone requires it.
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('phone')
    .eq('phone', phone)
    .maybeSingle();

  if (leadErr) {
    return NextResponse.json(
      { error: `Failed to look up lead: ${leadErr.message}` },
      { status: 500 },
    );
  }
  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  // 1. Send via WhatsApp.
  let waMessageId: string | null = null;
  try {
    const result = await sendText(phone, message);
    waMessageId = result.wa_message_id;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'send failed';
    // Save the failed attempt so the agent sees it in the chat panel.
    await supabase.from('messages').insert({
      phone,
      direction: 'outbound',
      content: message,
      message_type: 'text',
      sent_by: 'agent',
      status: 'failed',
      error_message: errMsg.slice(0, 500),
    });
    return NextResponse.json(
      { error: `WhatsApp send failed: ${errMsg}` },
      { status: 502 },
    );
  }

  // 2. Save outbound message (sent_by='agent').
  const nowIso = new Date().toISOString();
  const { data: inserted, error: insertErr } = await supabase
    .from('messages')
    .insert({
      phone,
      wa_message_id: waMessageId,
      direction: 'outbound',
      content: message,
      message_type: 'text',
      sent_by: 'agent',
      status: 'sent',
    })
    .select()
    .single();

  if (insertErr) {
    return NextResponse.json(
      { error: `Failed to save message: ${insertErr.message}` },
      { status: 500 },
    );
  }

  // 3. Update lead timestamps.
  await supabase
    .from('leads')
    .update({
      last_message_at: nowIso,
      last_outbound_at: nowIso,
      last_message_direction: 'outbound',
    })
    .eq('phone', phone);

  return NextResponse.json({ success: true, message: inserted }, { status: 200 });
}
