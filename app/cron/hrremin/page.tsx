import ReminderTable from '@/components/dashboard/cron/ReminderTable';

/**
 * Hourly-reminder monitoring page — shows today's (IST) booked site visits and
 * whether the 1-hour reminder has been sent.
 */
export default function HourlyReminderPage() {
  return <ReminderTable variant="hourly" />;
}
