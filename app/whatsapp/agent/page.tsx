'use client';

import AgentTab from '@/components/dashboard/tabs/AgentTab';

/**
 * Agent route — full-page AI agent configuration.
 */
export default function AgentPage() {
  return (
    <div className="h-full min-h-0 overflow-auto bg-white">
      <AgentTab />
    </div>
  );
}
