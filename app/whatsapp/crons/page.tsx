'use client';

import CronsTab from '@/components/dashboard/tabs/CronsTab';

/**
 * Crons route — full-page cron job status & logs.
 */
export default function CronsPage() {
  return (
    <div className="h-full min-h-0 overflow-auto bg-white">
      <CronsTab />
    </div>
  );
}
