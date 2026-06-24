'use client';

import CalendarTab from '@/components/dashboard/tabs/CalendarTab';

/**
 * Calendar route — full-page appointment calendar.
 */
export default function CalendarPage() {
  return (
    <div className="h-full min-h-0 overflow-auto bg-white">
      <CalendarTab />
    </div>
  );
}
