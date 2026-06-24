import { redirect } from 'next/navigation';

/**
 * /cron always lands on the daily-reminder view.
 */
export default function CronIndex() {
  redirect('/cron/dailyremin');
}
