'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Reply-mode selector that lives next to the message composer.
 *
 * Clicking the icon opens a small popover with two choices:
 *   - My Reply  → ai_mode = FALSE → the human agent answers from the dashboard.
 *   - AI Reply  → ai_mode = TRUE  → the AI chatbot answers inbound messages.
 *
 * Calls POST /api/leads/[phone]/ai-mode with { ai_mode: boolean } and reports
 * the new value back to the parent so the UI stays in sync.
 */

interface ReplyModeMenuProps {
  phone: string;
  aiMode: boolean;
  onChange: (aiMode: boolean) => void;
}

export default function ReplyModeMenu({
  phone,
  aiMode,
  onChange,
}: ReplyModeMenuProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  async function select(next: boolean) {
    if (saving) {
      return;
    }
    if (next === aiMode) {
      setOpen(false);
      return;
    }
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
        throw new Error(
          (j as { error?: string }).error || `Failed (${res.status})`,
        );
      }
      onChange(next);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  // Active accent: emerald when AI is replying, blue when the human is.
  const activeColor = aiMode ? 'text-emerald-600' : 'text-blue-600';

  return (
    <div ref={wrapRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={saving}
        aria-haspopup="menu"
        aria-expanded={open}
        title={aiMode ? 'AI Reply is on' : 'My Reply (you answer)'}
        className={`flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 transition hover:bg-gray-200 disabled:opacity-50 ${activeColor}`}
      >
        {aiMode ? (
          // sparkle / AI icon
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth={1.7}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.456-2.456L14.25 6l1.035-.259a3.375 3.375 0 0 0 2.456-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
          </svg>
        ) : (
          // person icon
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth={1.7}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
          </svg>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-12 left-0 z-20 w-52 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
        >
          <div className="border-b border-gray-100 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">
            Who replies?
          </div>
          <button
            type="button"
            role="menuitem"
            disabled={saving}
            onClick={() => select(false)}
            className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-gray-50 disabled:opacity-50 ${
              !aiMode ? 'bg-blue-50' : ''
            }`}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-blue-600">
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
              </svg>
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium text-gray-900">My Reply</span>
              <span className="block text-[11px] text-gray-400">You answer the customer</span>
            </span>
            {!aiMode && (
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-blue-600" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            )}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={saving}
            onClick={() => select(true)}
            className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-gray-50 disabled:opacity-50 ${
              aiMode ? 'bg-emerald-50' : ''
            }`}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
              </svg>
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium text-gray-900">AI Reply</span>
              <span className="block text-[11px] text-gray-400">Chatbot answers automatically</span>
            </span>
            {aiMode && (
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-emerald-600" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            )}
          </button>
          {error && (
            <div className="px-3 py-1.5 text-[11px] text-red-500">{error}</div>
          )}
        </div>
      )}
    </div>
  );
}
