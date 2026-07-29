import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { supabase } from '@/lib/supabase';
import { sendText, sendMedia, invalidateCredentialsCache } from '@/lib/whatsapp';
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
const APP_SECRET = process.env.META_APP_SECRET;

/**
 * Largest webhook body we will accept (bytes). Meta's payloads are small; the
 * coexistence `history` / `smb_app_state_sync` events are the biggest and stay
 * well under this. A cap matters because those payloads are persisted verbatim
 * into whatsapp_sync_events.
 */
const MAX_BODY_BYTES = 1_000_000; // 1 MB

// The signature check is a deliberate no-op when META_APP_SECRET is unset so
// that pre-existing deployments keep working. That silence is dangerous in
// production, so say so loudly once at startup.
if (!APP_SECRET && process.env.NODE_ENV === 'production') {
  // eslint-disable-next-line no-console
  console.warn(
    '[whatsapp webhook] WARNING: META_APP_SECRET is not set — X-Hub-Signature-256 ' +
      'verification is DISABLED and this webhook will accept unauthenticated payloads.',
  );
}

/**
 * Verify Meta's X-Hub-Signature-256 over the RAW request body.
 *
 * GUARDED: only enforced when META_APP_SECRET is configured. Without it the
 * webhook behaves exactly as it did before this feature was added, so an
 * existing deployment can never break by upgrading.
 */
function verifySignature(raw: string, header: string | null): boolean {
  if (!APP_SECRET) return true; // not configured — skip (legacy behaviour)
  if (!header || !header.startsWith('sha256=')) return false;

  const expected = createHmac('sha256', APP_SECRET).update(raw, 'utf8').digest();
  let received: Buffer;
  try {
    received = Buffer.from(header.slice('sha256='.length), 'hex');
  } catch {
    return false;
  }

  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}

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

/**
 * Coexistence: a message the business sent from the WhatsApp Business App on
 * the phone. Delivered on the `smb_message_echoes` field.
 */
interface WaMessageEcho {
  id?: string;
  from?: string; // the business number
  to?: string; // the customer (this is the lead)
  type?: string;
  text?: { body?: string };
  image?: { caption?: string };
  document?: { caption?: string; filename?: string };
}

interface WaChangeValue {
  contacts?: WaContact[];
  messages?: WaMessage[];
  statuses?: WaStatus[];
  // Coexistence additions (all optional — absent on classic payloads).
  message_echoes?: WaMessageEcho[];
  event?: string;
  phone_number?: string;
  waba_info?: { waba_id?: string };
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

// ---------------------------------------------------------------------------
// COEXISTENCE HANDLERS (additive — only fire on the new webhook fields)
// ---------------------------------------------------------------------------

/**
 * Handle `smb_message_echoes` — replies the agent typed in the WhatsApp
 * Business App on the phone. These are stored as OUTBOUND messages so the CRM
 * chat panel shows them, tagged source='whatsapp_business_app'.
 *
 * The AI is deliberately NOT triggered here: a human has already answered.
 */
async function handleMessageEchoes(echoes: WaMessageEcho[]): Promise<void> {
  for (const echo of echoes) {
    // `to` is the customer and therefore the lead. NEVER fall back to `from`
    // (the business's own number) — doing so would write our own number into
    // `leads` as if it were a customer and corrupt the phone-as-primary-key
    // contract. If `to` is absent the payload is not usable; skip it.
    const phone = echo.to;
    if (!phone) {
      // eslint-disable-next-line no-console
      console.error('[whatsapp webhook] smb_message_echoes entry missing "to" — skipped');
      continue;
    }

    const type = echo.type || 'text';
    const content =
      echo.text?.body ||
      echo.image?.caption ||
      echo.document?.caption ||
      echo.document?.filename ||
      `[${type}]`;

    const nowIso = new Date().toISOString();

    // messages.phone is FK → leads(phone): ensure the lead exists first.
    await supabase.from('leads').upsert(
      {
        phone,
        last_message_at: nowIso,
        last_outbound_at: nowIso,
        last_message_direction: 'outbound',
      },
      { onConflict: 'phone' },
    );

    // Same dedup contract as inbound: unique wa_message_id + ignoreDuplicates
    // makes Meta's retries safe, and also skips an echo of a message this CRM
    // itself sent through the Cloud API (already stored under the same id).
    await supabase.from('messages').upsert(
      {
        phone,
        wa_message_id: echo.id || null,
        direction: 'outbound',
        content,
        message_type: SUPPORTED_TYPES.has(type) ? type : 'text',
        sent_by: 'agent',
        source: 'whatsapp_business_app',
        status: 'sent',
      },
      { onConflict: 'wa_message_id', ignoreDuplicates: true },
    );
  }
}

/**
 * Handle `account_update` — coexistence lifecycle. Meta reports offboarding
 * (the number left the Cloud API) and reconnection here.
 */
async function handleAccountUpdate(value: WaChangeValue): Promise<void> {
  const event = (value.event || '').toUpperCase();
  if (!event) return;

  let status: string | null = null;
  if (event === 'PARTNER_REMOVED' || event === 'ACCOUNT_OFFBOARDED') {
    status = 'disconnected';
  } else if (event === 'ACCOUNT_RECONNECTED') {
    status = 'connected';
  }
  if (!status) return;

  await supabase
    .from('whatsapp_config')
    .update({ status, last_error: `account_update: ${event}` })
    .eq('id', 1);

  // Credentials may no longer be valid — force the next send to re-read.
  invalidateCredentialsCache();
}

/**
 * Persist raw `history` / `smb_app_state_sync` payloads.
 *
 * Meta allows the coexistence sync to be requested only once, within 24 hours
 * of onboarding, so the payloads are captured now even though the UI that
 * browses imported history/contacts is a later phase.
 */
async function handleSyncEvent(kind: string, value: WaChangeValue): Promise<void> {
  await supabase.from('whatsapp_sync_events').insert({ kind, payload: value });

  const column = kind === 'history' ? 'history_sync_status' : 'contact_sync_status';
  await supabase
    .from('whatsapp_config')
    .update({ [column]: 'receiving' })
    .eq('id', 1);
}

/**
 * Process the webhook body asynchronously (after the 200 is returned).
 */
async function processBody(body: unknown): Promise<void> {
  const typed = body as {
    object?: string;
    entry?: Array<{ changes?: Array<{ field?: string; value?: WaChangeValue }> }>;
  };

  if (typed.object !== 'whatsapp_business_account') return;

  for (const entry of typed.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value) continue;

      // Coexistence fields. Classic payloads (field === 'messages', or absent)
      // fall through to the original handling below, unchanged.
      switch (change.field) {
        case 'smb_message_echoes':
          if (value.message_echoes?.length) {
            await handleMessageEchoes(value.message_echoes);
          }
          continue;
        case 'account_update':
        case 'account_offboarded':
        case 'account_reconnected':
          await handleAccountUpdate(value);
          continue;
        case 'history':
        case 'smb_app_state_sync':
          await handleSyncEvent(change.field, value);
          continue;
        default:
          break;
      }

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
  // Read the RAW body once — the signature is computed over the exact bytes
  // Meta sent, so it must be verified before parsing.
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Reject oversized bodies before doing any work with them.
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    // eslint-disable-next-line no-console
    console.error('[whatsapp webhook] payload exceeds size limit — dropped');
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Guarded: a no-op unless META_APP_SECRET is configured.
  if (!verifySignature(raw, req.headers.get('x-hub-signature-256'))) {
    // eslint-disable-next-line no-console
    console.error('[whatsapp webhook] invalid X-Hub-Signature-256 — payload dropped');
    // 200 so Meta does not retry a payload we will never accept.
    return NextResponse.json({ received: true }, { status: 200 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
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
