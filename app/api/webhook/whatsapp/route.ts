import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendText, sendMedia } from '@/lib/whatsapp';
import {
  generateAIReply,
  bookAppointment,
  getBrochureFile,
  customerWantsBrochure, // deterministic brochure fallback
} from '@/lib/chatbot';

/**
 * WhatsApp Cloud API webhook.
 *
 * GET  — Meta verification handshake. If hub.verify_token matches
 *        WHATSAPP_VERIFY_TOKEN, echo hub.challenge.
 *
 * POST — Incoming event handler. Must return 200 quickly.
 *        - Ignores any object that is not 'whatsapp_business_account'.
 *        - Status events update messages.status by wa_message_id.
 *        - Message events: upsert lead, insert message (dedup on
 *          wa_message_id), write customer_replied, and — when ai_mode is
 *          TRUE — generate + send the AI reply inline.
 *
 * V1 message types handled: text, image, document, interactive.
 * Out of scope: audio, sticker, contacts, location.
 */

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

// ---------------------------------------------------------------------------
// GET — verification
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest): Promise<NextResponse> {
  const params = req.nextUrl.searchParams;
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');

  if (mode === 'subscribe' && token && VERIFY_TOKEN && token === VERIFY_TOKEN) {
    // Echo the challenge as plain text.
    return new NextResponse(challenge ?? '', { status: 200 });
  }

  return new NextResponse('Forbidden', { status: 403 });
}

// ---------------------------------------------------------------------------
// Types for the minimal slice of the WhatsApp payload we use.
// ---------------------------------------------------------------------------
interface WaContact {
  wa_id?: string;
  profile?: { name?: string };
}

interface WaMessage {
  id?: string;
  from?: string;
  type?: string;
  text?: { body?: string };
  image?: { caption?: string; id?: string };
  document?: { caption?: string; filename?: string; id?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
}

interface WaStatus {
  id?: string;
  status?: string;
  errors?: Array<{ title?: string; message?: string }>;
}

interface WaChangeValue {
  contacts?: WaContact[];
  messages?: WaMessage[];
  statuses?: WaStatus[];
}

const SUPPORTED_TYPES = new Set(['text', 'image', 'document', 'interactive']);

/**
 * Extract a human-readable content string from a supported message.
 * Returns null for unsupported types.
 */
function extractContent(msg: WaMessage): { content: string; type: string } | null {
  const type = msg.type || 'text';
  if (!SUPPORTED_TYPES.has(type)) return null;

  switch (type) {
    case 'text':
      return { content: msg.text?.body || '', type: 'text' };
    case 'image':
      return { content: msg.image?.caption || '[image]', type: 'image' };
    case 'document':
      return {
        content: msg.document?.caption || msg.document?.filename || '[document]',
        type: 'document',
      };
    case 'interactive': {
      const reply =
        msg.interactive?.button_reply?.title ||
        msg.interactive?.list_reply?.title ||
        '[interactive reply]';
      return { content: reply, type: 'interactive' };
    }
    default:
      return null;
  }
}

/**
 * Handle status update events: update messages.status by wa_message_id.
 */
async function handleStatuses(statuses: WaStatus[]): Promise<void> {
  for (const st of statuses) {
    if (!st.id || !st.status) continue;
    const errorMessage = st.errors?.[0]?.message || st.errors?.[0]?.title || null;
    const update: Record<string, unknown> = { status: st.status };
    if (errorMessage) update.error_message = errorMessage;
    await supabase.from('messages').update(update).eq('wa_message_id', st.id);
  }
}

/**
 * Handle one inbound message: upsert lead, insert message, write event,
 * and trigger the AI reply when ai_mode is TRUE.
 */
async function handleMessage(value: WaChangeValue, msg: WaMessage): Promise<void> {
  const phone = msg.from;
  if (!phone) return;

  const extracted = extractContent(msg);
  if (!extracted) {
    // Unsupported v1 type — ignore silently.
    return;
  }

  const waMessageId = msg.id || null;
  const profileName = value.contacts?.find((c) => c.wa_id === phone)?.profile?.name || null;
  const nowIso = new Date().toISOString();

  // 1. Upsert lead (phone is PK). Set inbound timestamps + direction.
  //    Only set full_name when we have one and the lead may be new.
  const { data: existingLead } = await supabase
    .from('leads')
    .select('phone, full_name, ai_mode')
    .eq('phone', phone)
    .maybeSingle();

  const leadUpsert: Record<string, unknown> = {
    phone,
    last_message_at: nowIso,
    last_inbound_at: nowIso,
    last_message_direction: 'inbound',
  };
  if (profileName && !existingLead?.full_name) {
    leadUpsert.full_name = profileName;
  }

  await supabase.from('leads').upsert(leadUpsert, { onConflict: 'phone' });

  // 2. Insert message with dedup on wa_message_id (ON CONFLICT DO NOTHING).
  //    CRITICAL: capture whether a NEW row was actually inserted. Meta retries
  //    the webhook whenever our 200 is slow (and the AI call takes a few
  //    seconds), redelivering the SAME message id. The upsert ignores the
  //    duplicate row, but we must also NOT generate a second AI reply for it.
  //    `.select()` returns the inserted rows only — empty on a duplicate.
  const { data: insertedRows } = await supabase
    .from('messages')
    .upsert(
      {
        phone,
        wa_message_id: waMessageId,
        direction: 'inbound',
        content: extracted.content,
        message_type: extracted.type,
        sent_by: 'customer',
        status: 'delivered',
      },
      { onConflict: 'wa_message_id', ignoreDuplicates: true },
    )
    .select('id');

  // If this message id was already processed (Meta retry), stop here — the
  // lead/timestamps are already current and the AI already replied once.
  // (waMessageId null = no id to dedup on, treat as new.)
  const isNewMessage = !waMessageId || (insertedRows?.length ?? 0) > 0;
  if (!isNewMessage) return;

  // 3. Write customer_replied to lead_events (only for genuinely new messages).
  await supabase.from('lead_events').insert({
    phone,
    event_type: 'customer_replied',
    event_description: extracted.content.slice(0, 200),
  });

  // 4. Resolve ai_mode (default TRUE for brand-new leads).
  const aiMode = existingLead?.ai_mode ?? true;

  // 5. If ai_mode is FALSE → stop. Agent responds from the dashboard.
  if (!aiMode) return;

  // 6. ai_mode TRUE → generate AI reply, send text, then perform any actions
  //    the AI requested (send the brochure file, book the appointment).
  try {
    const { reply, sendBrochure: aiWantsBrochure, booking } =
      await generateAIReply(phone);
    // Deterministic safety net: send the brochure if the AI asked for it OR the
    // customer's own message clearly requested it — so a real request always
    // delivers the file even when Gemini forgets the [SEND_BROCHURE] tag.
    const sendBrochure = aiWantsBrochure || customerWantsBrochure(extracted.content);

    // 6a. Send the text reply (if any).
    if (reply && reply.trim()) {
      const sendResult = await sendText(phone, reply);
      const outIso = new Date().toISOString();

      await supabase.from('messages').insert({
        phone,
        wa_message_id: sendResult.wa_message_id,
        direction: 'outbound',
        content: reply,
        message_type: 'text',
        sent_by: 'ai',
        status: 'sent',
      });

      await supabase
        .from('leads')
        .update({
          last_message_at: outIso,
          last_outbound_at: outIso,
          last_message_direction: 'outbound',
        })
        .eq('phone', phone);
    }

    // 6b. Book the appointment when the AI confirmed all details.
    //     Idempotent: skip if a non-cancelled visit already exists same day/time.
    if (booking) {
      try {
        const { data: sameDay } = await supabase
          .from('appointments')
          .select('id, visit_time, status')
          .eq('phone', phone)
          .eq('visit_date', booking.visit_date)
          .neq('status', 'cancelled');
        const dup = (sameDay ?? []).some((a) =>
          String(a.visit_time ?? '').startsWith(booking.visit_time),
        );
        if (!dup) {
          await bookAppointment(phone, booking, 'ai');
        }
      } catch (bookErr) {
        // eslint-disable-next-line no-console
        console.error(
          '[whatsapp webhook] booking failed:',
          bookErr instanceof Error ? bookErr.message : 'unknown',
        );
      }
    }

    // 6c. Send the brochure file when the AI requested it.
    if (sendBrochure) {
      try {
        const brochure = await getBrochureFile();
        if (brochure) {
          // Always send the brochure as a DOCUMENT. WhatsApp caps images at 5MB
          // but allows documents up to 100MB — sending as a document guarantees
          // delivery for any brochure (PDF or large combined PNG) and avoids
          // Meta's async "Media upload error" on oversized images.
          const sr = await sendMedia(
            phone,
            'document',
            brochure.file_url,
            undefined,
            brochure.file_name,
          );
          await supabase.from('messages').insert({
            phone,
            wa_message_id: sr.wa_message_id,
            direction: 'outbound',
            content: `[brochure sent: ${brochure.file_name}]`,
            message_type: 'document',
            media_url: brochure.file_url,
            sent_by: 'ai',
            status: 'sent',
          });
        }
      } catch (brErr) {
        // eslint-disable-next-line no-console
        console.error(
          '[whatsapp webhook] brochure send failed:',
          brErr instanceof Error ? brErr.message : 'unknown',
        );
      }
    }
  } catch (err) {
    // Never let an AI/send failure crash the webhook — record and move on.
    const message = err instanceof Error ? err.message : 'unknown AI reply error';
    await supabase.from('messages').insert({
      phone,
      direction: 'outbound',
      content: null,
      message_type: 'text',
      sent_by: 'ai',
      status: 'failed',
      error_message: message.slice(0, 500),
    });
  }
}

/**
 * Process the webhook body asynchronously (after the 200 is returned).
 */
async function processBody(body: unknown): Promise<void> {
  const typed = body as {
    object?: string;
    entry?: Array<{ changes?: Array<{ value?: WaChangeValue }> }>;
  };

  if (typed.object !== 'whatsapp_business_account') return;

  for (const entry of typed.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value) continue;

      if (value.statuses && value.statuses.length > 0) {
        await handleStatuses(value.statuses);
      }

      if (value.messages && value.messages.length > 0) {
        for (const msg of value.messages) {
          await handleMessage(value, msg);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// POST — incoming events
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    // Malformed body — acknowledge so Meta does not retry endlessly.
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Acknowledge IMMEDIATELY, then process in the background. This is an
  // always-on Node server so the event loop keeps running after the response.
  // Returning 200 fast is what stops Meta from retrying (and double-sending)
  // while the multi-second AI call runs. Idempotency on wa_message_id (above)
  // is the safety net for any retry that still slips through.
  void processBody(body).catch((err) => {
    const message = err instanceof Error ? err.message : 'unknown webhook error';
    // eslint-disable-next-line no-console
    console.error('[whatsapp webhook] processing error:', message);
  });

  return NextResponse.json({ received: true }, { status: 200 });
}
