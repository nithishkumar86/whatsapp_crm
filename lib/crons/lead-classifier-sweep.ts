import { supabase } from '@/lib/supabase';
import { classifyLead } from '@/lib/lead-classifier';

/**
 * Cron 4 — Lead-Status Classifier Idle Sweep.
 *
 * Schedule: * * * * * (every minute, Asia/Kolkata).
 *
 * Finds leads whose conversation went idle ~5 minutes ago and re-classifies
 * them with the AI classifier (lib/lead-classifier.ts). This fires once per
 * idle period per lead — NOT per message — so there is zero added latency on
 * the WhatsApp webhook (which must return inside Meta's retry window).
 *
 * A lead is a candidate when:
 *   - last_inbound_at IS NOT NULL  (the customer has replied at least once;
 *     leads with only the welcome template stay 'New')
 *   - last_message_at < now() - 5 minutes  (the chat is idle)
 *   - last_classified_at IS NULL OR last_classified_at < last_message_at
 *     (newly idle since the last classification — re-fires if the chat resumes
 *     and goes idle again)
 *
 * The last condition is a column-to-column comparison that PostgREST cannot
 * express in a filter, so it is applied in JS after the bounded fetch.
 *
 * Every run writes one cron_logs row.
 */

const CRON_NAME = 'lead_classifier_sweep';
const IDLE_MINUTES = 5;
const BATCH_LIMIT = 50;

interface LeadRow {
  phone: string;
  last_message_at: string | null;
  last_classified_at: string | null;
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
 * Run the idle-sweep once. `messagesSent` counts leads classified this run.
 * Also writes a cron_logs row as a side effect.
 */
export async function runLeadClassifierSweep(): Promise<CronRunResult> {
  let classified = 0;

  try {
    const cutoffIso = new Date(
      Date.now() - IDLE_MINUTES * 60 * 1000,
    ).toISOString();

    // Bounded candidate fetch: customer has replied AND chat is idle.
    const { data: leads, error: queryErr } = await supabase
      .from('leads')
      .select('phone, last_message_at, last_classified_at')
      .not('last_inbound_at', 'is', null)
      .lt('last_message_at', cutoffIso)
      .order('last_message_at', { ascending: true })
      .limit(BATCH_LIMIT);

    if (queryErr) {
      throw new Error(`failed to query leads: ${queryErr.message}`);
    }

    const rows = (leads as LeadRow[]) || [];

    // Keep only leads newly idle since the last classification.
    const candidates = rows.filter((l) => {
      if (!l.last_message_at) return false;
      if (!l.last_classified_at) return true;
      return (
        new Date(l.last_classified_at).getTime() <
        new Date(l.last_message_at).getTime()
      );
    });

    for (const lead of candidates) {
      if (!lead.phone) continue;
      try {
        await classifyLead(lead.phone);
        classified += 1;
      } catch (err) {
        // A single lead's failure must not abort the batch.
        // eslint-disable-next-line no-console
        console.error(
          `[cron:${CRON_NAME}] classify failed for ${lead.phone}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    await writeCronLog('success', classified, null);
    return { status: 'success', messagesSent: classified, errorMessage: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown cron error';
    await writeCronLog('failed', classified, message);
    return { status: 'failed', messagesSent: classified, errorMessage: message };
  }
}
