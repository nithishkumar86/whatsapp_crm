import LeadTable from '@/components/dashboard/admin/LeadTable';

export default function TodayLeadsPage() {
  return <LeadTable title="Today's Leads" filter="today" fullTable />;
}
