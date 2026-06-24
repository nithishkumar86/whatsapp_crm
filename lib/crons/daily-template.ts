import { supabase } from '@/lib/supabase';
import { sendTemplate } from '@/lib/whatsapp';
import { recordTemplateSent } from '@/lib/template-tracking';

/**
 * Cron 1 — Daily Re-engagement Template.
 *
 * Schedule: 0 9 * * * (9:00 AM IST every day).
 *
 * Query leads whose last_message_at is older than 24 hours and who still have
 * ai_mode = TRUE, then send the re-engagement template to each. Every send is
 * persisted to `messages`, lead timestamps are bumped, and a `followup_sent`
 * row is written to `lead_events`. The whole run is wrapped so that a single
 * failed send never aborts the batch, and the outcome is always written to
 * `cron_logs`.
 */

// Configurable template constants.
const REENGAGEMENT_TEMPLATE = 'reengagement';
const TEMPLATE_LANG = 'en';

const CRON_NAME = 'daily_template';

interface LeadRow {
  phone: string;
}

export interface CronRunResult {
  status: 'success' | 'failed';
  messagesSent: number;
  errorMessage: string | null;
}

/**
 * Write a row to cron_logs. Never throws — logging failures are swallowed so
 * they cannot mask the actual cron outcome.
 */
async function writeCronLog(
  status: 'success' | 'failed',
  messagesSent: number,
  errorMessage: string | null,
): Promise<void> {
  try {
    await supabase.from('cron_logs').insert({
      cron_name: CRON_NAME,
      status,
      messages_sent: messagesSent,
      error_message: errorMessage ? errorMessage.slice(0, 1000) : null,
    });
  } catch {
    // Intentionally ignored — cron_logs write must not crash the process.
  }
}

/**
 * Run the daily re-engagement cron once.
 * Returns a summary; also writes a cron_logs row as a side effect.
 */
export async function runDailyTemplate(): Promise<CronRunResult> {
  let messagesSent = 0;

  try {
    // last_message_at older than 24 hours, ai_mode = TRUE.
    const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: leads, error: queryErr } = await supabase
      .from('leads')
      .select('phone')
      .eq('ai_mode', true)
      .lt('last_message_at', cutoffIso);

    if (queryErr) {
      throw new Error(`failed to query leads: ${queryErr.message}`);
    }

    const rows = (leads as LeadRow[]) || [];

    for (const lead of rows) {
      const phone = lead.phone;
      if (!phone) continue;

      let waMessageId: string | null = null;
      let sendError: string | null = null;

      try {
        const result = await sendTemplate(
          phone,
          REENGAGEMENT_TEMPLATE,
          TEMPLATE_LANG,
        );
        waMessageId = result.wa_message_id;
      } catch (err) {
        sendError = err instanceof Error ? err.message : 'template send failed';
      }

      const nowIso = new Date().toISOString();

      // Save to messages (sent_by='cron', message_type='template').
      await supabase.from('messages').insert({
        phone,
        wa_message_id: waMessageId,
        direction: 'outbound',
        content: null,
        message_type: 'template',
        sent_by: 'cron',
        template_name: REENGAGEMENT_TEMPLATE,
        status: sendError ? 'failed' : 'sent',
        error_message: sendError ? sendError.slice(0, 500) : null,
      });

      // Only count + bump timestamps + log event on a successful send.
      if (!sendError) {
        await supabase
          .from('leads')
          .update({
            last_message_at: nowIso,
            last_outbound_at: nowIso,
            last_message_direction: 'outbound',
          })
          .eq('phone', phone);

        await supabase.from('lead_events').insert({
          phone,
          event_type: 'followup_sent',
          event_description: `Re-engagement template '${REENGAGEMENT_TEMPLATE}' sent`,
        });

        await recordTemplateSent(phone, REENGAGEMENT_TEMPLATE);

        messagesSent += 1;
      }
    }

    await writeCronLog('success', messagesSent, null);
    return { status: 'success', messagesSent, errorMessage: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown cron error';
    await writeCronLog('failed', messagesSent, message);
    return { status: 'failed', messagesSent, errorMessage: message };
  }
}
