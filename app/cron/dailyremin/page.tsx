import ReminderTable from '@/components/dashboard/cron/ReminderTable';

/**
 * Daily-reminder monitoring page — shows tomorrow's (IST) booked site visits
 * and whether the 1-day reminder has been sent.
 */
export default function DailyReminderPage() {
  return <ReminderTable variant="daily" />;
}
