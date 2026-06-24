import cron from 'node-cron';
import { runDailyTemplate } from './daily-template';
import { runTomorrowReminder } from './tomorrow-reminder';
import { runHourlyReminder } from './hourly-reminder';
import { runLeadClassifierSweep } from './lead-classifier-sweep';

/**
 * Cron bootstrap.
 *
 * Registers all scheduled jobs in the Asia/Kolkata timezone:
 *   - Cron 1 (daily_template):         0 9 * * *  (9:00 AM IST)  re-engagement
 *   - Cron 2 (tomorrow_reminder):      0 8 * * *  (8:00 AM IST)  next-day reminder
 *   - Cron 3 (hourly_reminder):        0 * * * *  (top of hour)  1-hour reminder
 *   - Cron 4 (lead_classifier_sweep):  * * * * *  (every minute) idle classify
 *
 * bootstrapCrons is idempotent — calling it more than once (e.g. due to a
 * hot reload) will not double-register the schedules.
 */

const TIMEZONE = 'Asia/Kolkata';

let registered = false;

/**
 * Run a cron job function safely: never let an unhandled rejection escape into
 * the node-cron scheduler. Each job already logs to cron_logs internally.
 */
function safeRun(
  name: string,
  fn: () => Promise<{ status: string; messagesSent: number }>,
): void {
  fn()
    .then((res) => {
      // eslint-disable-next-line no-console
      console.log(
        `[cron:${name}] ${res.status} — ${res.messagesSent} message(s) sent`,
      );
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(`[cron:${name}] unexpected failure:`, err);
    });
}

/**
 * Schedule all three crons. Safe to call once on server startup.
 */
export function bootstrapCrons(): void {
  if (registered) {
    // eslint-disable-next-line no-console
    console.log('[cron] bootstrap skipped — already registered');
    return;
  }
  registered = true;

  // Cron 1 — Daily Re-engagement (9:00 AM IST).
  cron.schedule('0 9 * * *', () => safeRun('daily_template', runDailyTemplate), {
    timezone: TIMEZONE,
  });

  // Cron 2 — Tomorrow Site Visit Reminder (8:00 AM IST).
  cron.schedule(
    '0 8 * * *',
    () => safeRun('tomorrow_reminder', runTomorrowReminder),
    { timezone: TIMEZONE },
  );

  // Cron 3 — 1 Hour Before Visit Reminder (every hour on the hour).
  cron.schedule(
    '0 * * * *',
    () => safeRun('hourly_reminder', runHourlyReminder),
    { timezone: TIMEZONE },
  );

  // Cron 4 — Lead-Status Classifier Idle Sweep (every minute). Re-classifies
  // leads ~5 minutes after their conversation goes idle. Background only —
  // never touches the webhook request path.
  cron.schedule(
    '* * * * *',
    () => safeRun('lead_classifier_sweep', runLeadClassifierSweep),
    { timezone: TIMEZONE },
  );

  // eslint-disable-next-line no-console
  console.log(`[cron] bootstrapped 4 jobs in timezone ${TIMEZONE}`);
}
