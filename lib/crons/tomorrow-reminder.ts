import { supabase } from '@/lib/supabase';
import { sendTemplate } from '@/lib/whatsapp';
import { toZonedTime, formatInTimeZone } from 'date-fns-tz';
import { addDays } from 'date-fns';

/**
 * Cron 2 — Tomorrow Site Visit Reminder.
 *
 * Schedule: 0 8 * * * (8:00 AM IST every day).
 *
 * Query appointments whose visit_date is tomorrow (IST), that have not yet had
 * a 1-day reminder sent, and that are not cancelled. Send the reminder
 * template to each, flag reminder_1day_sent = TRUE, persist the message,
 * write `reminder_sent` to lead_events, and record the run in cron_logs.
 */

// Configurable template constants.
const VISIT_REMINDER_TEMPLATE = 'visit_reminder';
const TEMPLATE_LANG = 'en';

const CRON_NAME = 'tomorrow_reminder';
const IST_TZ = 'Asia/Kolkata';

interface AppointmentRow {
  id: string;
  phone: string;
  visit_date: string;
  visit_time: string;
}

export interface CronRunResult {
  status: 'success' | 'failed';
  messagesSent: number;
  errorMessage: string | null;
}

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
 * Compute tomorrow's date (TODAY + 1) in IST as a YYYY-MM-DD string.
 */
export function tomorrowDateIST(now: Date = new Date()): string {
  const istNow = toZonedTime(now, IST_TZ);
  const istTomorrow = addDays(istNow, 1);
  // Format the IST-tomorrow instant back in IST to get the calendar date.
  return formatInTimeZone(istTomorrow, IST_TZ, 'yyyy-MM-dd');
}

/**
 * Run the tomorrow-reminder cron once.
 */
export async function runTomorrowReminder(): Promise<CronRunResult> {
  let messagesSent = 0;

  try {
    const targetDate = tomorrowDateIST();

    const { data: appts, error: queryErr } = await supabase
      .from('appointments')
      .select('id, phone, visit_date, visit_time')
      .eq('visit_date', targetDate)
      .eq('reminder_1day_sent', false)
      .neq('status', 'cancelled');

    if (queryErr) {
      throw new Error(`failed to query appointments: ${queryErr.message}`);
    }

    const rows = (appts as AppointmentRow[]) || [];

    for (const appt of rows) {
      const phone = appt.phone;
      if (!phone) continue;

      let waMessageId: string | null = null;
      let sendError: string | null = null;

      try {
        const result = await sendTemplate(
          phone,
          VISIT_REMINDER_TEMPLATE,
          TEMPLATE_LANG,
        );
        waMessageId = result.wa_message_id;
      } catch (err) {
        sendError = err instanceof Error ? err.message : 'template send failed';
      }

      const nowIso = new Date().toISOString();

      await supabase.from('messages').insert({
        phone,
        wa_message_id: waMessageId,
        direction: 'outbound',
        content: null,
        message_type: 'template',
        sent_by: 'cron',
        template_name: VISIT_REMINDER_TEMPLATE,
        status: sendError ? 'failed' : 'sent',
        error_message: sendError ? sendError.slice(0, 500) : null,
      });

      // Record EVERY attempt (success AND failure) so the cron run-log always
      // reflects that this appointment was processed. `reminder_1day_sent` stays
      // success-only so a failed reminder is retried on the next run.
      await supabase
        .from('appointments')
        .update({
          reminder_1day_run_at: nowIso,
          reminder_1day_result: sendError ? 'failed' : 'sent',
          ...(sendError ? {} : { reminder_1day_sent: true }),
        })
        .eq('id', appt.id);

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
          event_type: 'reminder_sent',
          event_description: `1-day site visit reminder sent for ${appt.visit_date} ${appt.visit_time}`,
        });

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
