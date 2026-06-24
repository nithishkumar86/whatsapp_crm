import { redirect } from 'next/navigation';

/**
 * /dashboard always lands on the all-leads view.
 */
export default function DashboardIndex() {
  redirect('/dashboard/leads');
}
