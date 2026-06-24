import { supabase } from '@/lib/supabase';
import { sendTemplate, sendText } from '@/lib/whatsapp';
import { formatInTimeZone } from 'date-fns-tz';

/**
 * Cron 3 — 1 Hour Before Visit Reminder.
 *
 * Schedule: 0 * * * * (every hour, on the hour, IST).
 *
 * Get the current IST time, then find appointments scheduled for today (IST)
 * whose visit_time falls inside the [now+55min, now+65min] window, that have
 * not yet had their 1-hour reminder sent, and that are not cancelled. For each:
 * if the 24h customer-service session is OPEN (the lead messaged within the last
 * 24h) send a PERSONALIZED custom message with their name/date/time/location/map
 * link; otherwise fall back to the approved reminder template. Then flag
 * reminder_1hr_sent = TRUE, persist the message, write `reminder_sent`, and
 * record the run in cron_logs.
 *
 * The window math is done in "minutes since IST midnight" so it is independent
 * of the host machine's local timezone.
 */

// Configurable template constants.
const VISIT_REMINDER_TEMPLATE = 'visit_reminder';
const TEMPLATE_LANG = 'en';

const CRON_NAME = 'hourly_reminder';
const IST_TZ = 'Asia/Kolkata';

const WINDOW_MIN = 55;
const WINDOW_MAX = 65;

interface AppointmentRow {
  id: string;
  phone: string;
  full_name: string | null;
  visit_date: string;
  visit_time: string;
  location_preference: string | null;
  map_link: string | null;
}

// WhatsApp free-text (non-template) messages are only deliverable inside the
// 24-hour customer-service window — i.e. when the customer messaged us within
// the last 24h. We send a personalized custom message when that window is open,
// and fall back to the approved template otherwise.
const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Build the personalized 1-hour reminder text for a booked site visit.
 */
export function buildReminderText(a: AppointmentRow): string {
  const name = a.full_name || 'there';
  const time = a.visit_time?.slice(0, 5) || a.visit_time;
  const lines = [
    `JV Site visit Reminder`,
    name,
    `Date: ${a.visit_date}`,
    `Time: ${time}`,
    `Location: ${a.location_preference || '-'}`,
  ];
  if (a.map_link) lines.push(`Google Map: ${a.map_link}`);
  return lines.join('\n');
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
 * Convert an HH:MM[:SS] time string to minutes since midnight.
 * Returns NaN for malformed input.
 */
export function timeToMinutes(time: string): number {
  if (!time) return NaN;
  const parts = time.split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
}

/**
 * Today's date (IST) as YYYY-MM-DD.
 */
export function todayDateIST(now: Date = new Date()): string {
  return formatInTimeZone(now, IST_TZ, 'yyyy-MM-dd');
}

/**
 * Current minutes-since-midnight in IST.
 */
export function nowMinutesIST(now: Date = new Date()): number {
  const hh = formatInTimeZone(now, IST_TZ, 'HH');
  const mm = formatInTimeZone(now, IST_TZ, 'mm');
  return Number(hh) * 60 + Number(mm);
}

/**
 * True when an appointment time falls in [now+55, now+65] minutes.
 */
export function isInReminderWindow(
  visitTime: string,
  nowMinutes: number,
): boolean {
  const apptMinutes = timeToMinutes(visitTime);
  if (!Number.isFinite(apptMinutes)) return false;
  const diff = apptMinutes - nowMinutes;
  return diff >= WINDOW_MIN && diff <= WINDOW_MAX;
}

/**
 * Run the hourly-reminder cron once.
 */
export async function runHourlyReminder(): Promise<CronRunResult> {
  let messagesSent = 0;

  try {
    const targetDate = todayDateIST();
    const nowMinutes = nowMinutesIST();

    // Pull today's non-cancelled, not-yet-reminded appointments, then filter
    // the 55–65 minute window precisely in JS (IST minutes-of-day).
    const { data: appts, error: queryErr } = await supabase
      .from('appointments')
      .select('id, phone, full_name, visit_date, visit_time, location_preference, map_link')
      .eq('visit_date', targetDate)
      .eq('reminder_1hr_sent', false)
      .neq('status', 'cancelled');

    if (queryErr) {
      throw new Error(`failed to query appointments: ${queryErr.message}`);
    }

    const rows = ((appts as AppointmentRow[]) || []).filter((a) =>
      isInReminderWindow(a.visit_time, nowMinutes),
    );

    for (const appt of rows) {
      const phone = appt.phone;
      if (!phone) continue;

      // Decide channel: if the customer messaged us within the last 24h the
      // session window is OPEN → send a personalized custom (free-text) message
      // with their details. Otherwise free-text is blocked by Meta → fall back
      // to the approved template.
      const { data: leadRow } = await supabase
        .from('leads')
        .select('last_inbound_at')
        .eq('phone', phone)
        .maybeSingle();
      const lastInbound = leadRow?.last_inbound_at
        ? new Date(leadRow.last_inbound_at as string).getTime()
        : 0;
      const sessionOpen = Date.now() - lastInbound < SESSION_WINDOW_MS;

      let waMessageId: string | null = null;
      let sendError: string | null = null;
      let usedCustom = false;
      const customText = buildReminderText(appt);

      try {
        if (sessionOpen) {
          // Custom message with the user's details.
          const result = await sendText(phone, customText);
          waMessageId = result.wa_message_id;
          usedCustom = true;
        } else {
          const result = await sendTemplate(
            phone,
            VISIT_REMINDER_TEMPLATE,
            TEMPLATE_LANG,
          );
          waMessageId = result.wa_message_id;
        }
      } catch (err) {
        sendError = err instanceof Error ? err.message : 'reminder send failed';
      }

      const nowIso = new Date().toISOString();

      await supabase.from('messages').insert({
        phone,
        wa_message_id: waMessageId,
        direction: 'outbound',
        content: usedCustom ? customText : null,
        message_type: usedCustom ? 'text' : 'template',
        sent_by: 'cron',
        template_name: usedCustom ? null : VISIT_REMINDER_TEMPLATE,
        status: sendError ? 'failed' : 'sent',
        error_message: sendError ? sendError.slice(0, 500) : null,
      });

      // Record EVERY attempt (success AND failure) so the cron run-log always
      // reflects that this appointment was processed. `reminder_1hr_sent` stays
      // success-only so a failed reminder is retried on the next run.
      await supabase
        .from('appointments')
        .update({
          reminder_1hr_run_at: nowIso,
          reminder_1hr_result: sendError ? 'failed' : 'sent',
          ...(sendError ? {} : { reminder_1hr_sent: true }),
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
          event_description: `1-hour site visit reminder sent for ${appt.visit_date} ${appt.visit_time}`,
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
