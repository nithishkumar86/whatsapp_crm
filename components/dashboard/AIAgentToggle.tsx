'use client';

import { useState } from 'react';

/**
 * AI / Agent switch for a single chat.
 *
 * Calls POST /api/leads/[phone]/ai-mode with { ai_mode: boolean } and reports
 * the new value back to the parent so the UI stays in sync.
 *
 * ai_mode = TRUE  → the AI chatbot replies to inbound messages automatically.
 * ai_mode = FALSE → the agent handles the conversation from the dashboard.
 */

interface AIAgentToggleProps {
  phone: string;
  aiMode: boolean;
  onChange: (aiMode: boolean) => void;
}

export default function AIAgentToggle({
  phone,
  aiMode,
  onChange,
}: AIAgentToggleProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (saving) return;
    const next = !aiMode;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/leads/${encodeURIComponent(phone)}/ai-mode`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ai_mode: next }),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || `Failed (${res.status})`);
      }
      onChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className={`text-xs font-medium ${
          aiMode ? 'text-green-600' : 'text-gray-400'
        }`}
      >
        AI
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={!aiMode}
        disabled={saving}
        onClick={toggle}
        title={aiMode ? 'AI is replying' : 'Agent is handling'}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
          aiMode ? 'bg-green-500' : 'bg-blue-500'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            aiMode ? 'translate-x-1' : 'translate-x-6'
          }`}
        />
      </button>
      <span
        className={`text-xs font-medium ${
          !aiMode ? 'text-blue-600' : 'text-gray-400'
        }`}
      >
        Agent
      </span>
      {error && <span className="ml-2 text-[10px] text-red-500">{error}</span>}
    </div>
  );
}
