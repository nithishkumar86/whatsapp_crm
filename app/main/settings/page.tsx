'use client';

import SettingsTab from '@/components/dashboard/tabs/SettingsTab';

/**
 * Settings route — WhatsApp Cloud API connection (Embedded Signup).
 */
export default function SettingsPage() {
  return (
    <div className="h-full min-h-0 overflow-auto bg-white dark:bg-gray-950">
      <SettingsTab />
    </div>
  );
}
