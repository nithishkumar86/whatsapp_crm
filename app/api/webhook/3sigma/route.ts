import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendTemplate } from '@/lib/whatsapp';
import { recordTemplateSent } from '@/lib/template-tracking';

/**
 * 3Sigma CRM lead intake webhook.
 *
 * 1. Parse lead fields.
 * 2. Upsert into leads by phone.
 * 3. If new phone → write lead_created to lead_events.
 * 4. Send welcome_lead template via WhatsApp API.
 * 5. Save outbound template message (sent_by='system', type='template').
 * 6. Write welcome_template_sent to lead_events.
 * 7. Return 200.
 *
 * The `welcome_lead` template must be pre-approved in Meta Business Manager.
 */

const WELCOME_TEMPLATE = 'welcome_lead';
const TEMPLATE_LANG = 'en';

interface ThreeSigmaPayload {
  full_name?: string;
  phone?: string;
  email?: string;
  land_size?: string;
  land_location?: string;
  street_address?: string;
  is_decision_maker?: boolean;
  owns_land_chennai?: boolean;
  project_start_date?: string;
}

/**
 * Coerce a possibly-string boolean field into a real boolean | null.
 */
function toBool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase();
    if (t === 'true' || t === 'yes' || t === '1') return true;
    if (t === 'false' || t === 'no' || t === '0') return false;
  }
  return null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: ThreeSigmaPayload;
  try {
    body = (await req.json()) as ThreeSigmaPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Validate the only required field.
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  if (!phone) {
    return NextResponse.json({ error: 'phone is required' }, { status: 400 });
  }

  try {
    // 1. Determine if this is a new lead (for lead_created event).
    const { data: existing } = await supabase
      .from('leads')
      .select('phone')
      .eq('phone', phone)
      .maybeSingle();

    const isNew = !existing;

    // 2. Upsert into leads by phone. Only include provided fields.
    const leadRow: Record<string, unknown> = { phone };
    // New leads start as 'New' (welcome template sent, awaiting first reply).
    // Don't overwrite the status of an existing lead the classifier may own.
    if (isNew) leadRow.lead_status = 'New';
    if (body.full_name != null) leadRow.full_name = body.full_name;
    if (body.email != null) leadRow.email = body.email;
    if (body.land_size != null) leadRow.land_size = body.land_size;
    if (body.land_location != null) leadRow.land_location = body.land_location;
    if (body.street_address != null) leadRow.street_address = body.street_address;
    if (body.is_decision_maker != null)
      leadRow.is_decision_maker = toBool(body.is_decision_maker);
    if (body.owns_land_chennai != null)
      leadRow.owns_land_chennai = toBool(body.owns_land_chennai);
    if (body.project_start_date != null)
      leadRow.project_start_date = body.project_start_date;

    const { error: upsertErr } = await supabase
      .from('leads')
      .upsert(leadRow, { onConflict: 'phone' });

    if (upsertErr) {
      return NextResponse.json(
        { error: `Failed to upsert lead: ${upsertErr.message}` },
        { status: 500 },
      );
    }

    // 3. New lead → lead_created event.
    if (isNew) {
      await supabase.from('lead_events').insert({
        phone,
        event_type: 'lead_created',
        event_description: `Lead created from 3Sigma${
          body.full_name ? ` (${body.full_name})` : ''
        }`,
      });
    }

    // 4. Send welcome_lead template.
    let waMessageId: string | null = null;
    let templateError: string | null = null;
    try {
      const result = await sendTemplate(phone, WELCOME_TEMPLATE, TEMPLATE_LANG);
      waMessageId = result.wa_message_id;
    } catch (err) {
      templateError = err instanceof Error ? err.message : 'template send failed';
    }

    // 5. Save outbound template message.
    const nowIso = new Date().toISOString();
    await supabase.from('messages').insert({
      phone,
      wa_message_id: waMessageId,
      direction: 'outbound',
      content: null,
      message_type: 'template',
      sent_by: 'system',
      template_name: WELCOME_TEMPLATE,
      status: templateError ? 'failed' : 'sent',
      error_message: templateError ? templateError.slice(0, 500) : null,
    });

    // Update outbound timestamps.
    await supabase
      .from('leads')
      .update({
        last_message_at: nowIso,
        last_outbound_at: nowIso,
        last_message_direction: 'outbound',
      })
      .eq('phone', phone);

    // 6. Write welcome_template_sent (only on successful send).
    if (!templateError) {
      await supabase.from('lead_events').insert({
        phone,
        event_type: 'welcome_template_sent',
        event_description: `Welcome template '${WELCOME_TEMPLATE}' sent`,
      });

      await recordTemplateSent(phone, WELCOME_TEMPLATE);
    }

    // 7. Return 200.
    return NextResponse.json(
      { received: true, phone, new_lead: isNew, template_sent: !templateError },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
