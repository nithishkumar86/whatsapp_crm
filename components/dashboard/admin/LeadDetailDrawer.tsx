'use client';

import Link from 'next/link';
import LeadStatusBadge from '@/components/dashboard/LeadStatusBadge';

/**
 * Slide-over panel showing every field for a selected lead row.
 *
 * Driven entirely from the row data already fetched by LeadTable — no extra
 * API call. Closes on backdrop click or the X button.
 */

export interface LeadRow {
  phone: string;
  full_name: string | null;
  lead_status: string | null;
  lead_reason: string | null;
  assigned_to: string | null;
  last_message_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  // Extra columns — populated for the full leads table (/dashboard/leads & /today).
  email?: string | null;
  land_size?: string | null;
  land_location?: string | null;
  street_address?: string | null;
  is_decision_maker?: boolean | null;
  owns_land_chennai?: boolean | null;
  project_start_date?: string | null;
  budget?: string | null;
  location_preference?: string | null;
  ai_mode?: boolean | null;
  conversation_status?: string | null;
  last_inbound_at?: string | null;
  last_outbound_at?: string | null;
  last_message_direction?: string | null;
  lead_lost_factor?: string | null;
  last_classified_at?: string | null;
}

interface LeadDetailDrawerProps {
  lead: LeadRow | null;
  onClose: () => void;
}

function fmt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString([], {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-b border-gray-100 py-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm text-gray-800">{value}</dd>
    </div>
  );
}

export default function LeadDetailDrawer({ lead, onClose }: LeadDetailDrawerProps) {
  if (!lead) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Backdrop */}
      <button
        aria-label="Close details"
        onClick={onClose}
        className="absolute inset-0 bg-black/30 backdrop-blur-[1px] transition-opacity"
      />

      {/* Panel */}
      <aside className="relative z-10 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-gray-100 bg-gradient-to-r from-emerald-600 to-green-700 px-5 py-4 text-white">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">
              {lead.full_name || lead.phone}
            </h2>
            <p className="truncate text-xs text-emerald-50/90">{lead.phone}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-3 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-white/90 transition hover:bg-white/20"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5">
          <dl>
            <Field label="Full Name" value={lead.full_name || '—'} />
            <Field label="Phone" value={lead.phone} />
            <Field
              label="Lead Status"
              value={
                <LeadStatusBadge
                  status={lead.lead_status}
                  reason={lead.lead_reason}
                />
              }
            />
            <Field label="Reason" value={lead.lead_reason || '—'} />
            <Field label="Assigned To" value={lead.assigned_to || '—'} />
            <Field label="Last Message At" value={fmt(lead.last_message_at)} />
            <Field label="Created At" value={fmt(lead.created_at)} />
            <Field label="Updated At" value={fmt(lead.updated_at)} />
          </dl>
        </div>

        <footer className="border-t border-gray-100 p-4">
          <Link
            href={`/main/chat?phone=${encodeURIComponent(lead.phone)}`}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9M7.5 12h6m4.5 4.5-3 3v-3H6.75A2.25 2.25 0 0 1 4.5 14.25v-7.5A2.25 2.25 0 0 1 6.75 4.5h10.5A2.25 2.25 0 0 1 19.5 6.75v7.5A2.25 2.25 0 0 1 18 16.5Z" />
            </svg>
            Open Chat
          </Link>
        </footer>
      </aside>
    </div>
  );
}
