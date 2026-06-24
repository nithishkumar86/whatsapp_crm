'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LeadStatusBadge from '@/components/dashboard/LeadStatusBadge';
import LeadDetailDrawer, { LeadRow } from './LeadDetailDrawer';

/**
 * Shared admin leads table.
 *
 * Polls GET /api/dashboard/leads?filter=<filter> every ~5s (cache:'no-store').
 * Renders an attractive card with a header (title + live row count), a
 * client-side search box over name/phone, a styled table, loading skeleton,
 * and an empty state. Per row: View (detail drawer) + Open Chat deep-link.
 *
 * Browser never talks to Supabase — all data comes from the API route.
 */

interface LeadTableProps {
  title: string;
  filter: string;
  /**
   * When true, render the ENTIRE leads table (all columns) inside a horizontally
   * scrollable area with ◀ / ▶ scroll buttons. Used only by /dashboard/leads and
   * /dashboard/today; every other view keeps the compact table.
   */
  fullTable?: boolean;
}

const POLL_MS = 5000;

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString([], {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Yes / No for booleans; em-dash when unset. */
function fmtBool(v: boolean | null | undefined): string {
  if (v === true) return 'Yes';
  if (v === false) return 'No';
  return '—';
}

/** Plain text cell value, em-dash when empty. */
function fmtText(v: string | null | undefined): React.ReactNode {
  return v ? v : <span className="text-gray-300">—</span>;
}

/**
 * Every column of the leads table, in display order. `kind` controls formatting.
 * Rendered only in full-table mode.
 */
const FULL_COLUMNS: {
  key: keyof LeadRow;
  label: string;
  kind: 'text' | 'date' | 'bool' | 'status';
}[] = [
  { key: 'full_name', label: 'Full Name', kind: 'text' },
  { key: 'phone', label: 'Phone', kind: 'text' },
  { key: 'email', label: 'Email', kind: 'text' },
  { key: 'lead_status', label: 'Lead Status', kind: 'status' },
  { key: 'lead_reason', label: 'Reason', kind: 'text' },
  { key: 'lead_lost_factor', label: 'Lost Factor', kind: 'text' },
  { key: 'land_size', label: 'Land Size', kind: 'text' },
  { key: 'land_location', label: 'Land Location', kind: 'text' },
  { key: 'street_address', label: 'Street Address', kind: 'text' },
  { key: 'is_decision_maker', label: 'Decision Maker', kind: 'bool' },
  { key: 'owns_land_chennai', label: 'Owns Land (Chennai)', kind: 'bool' },
  { key: 'project_start_date', label: 'Project Start', kind: 'text' },
  { key: 'budget', label: 'Budget', kind: 'text' },
  { key: 'location_preference', label: 'Location Preference', kind: 'text' },
  { key: 'ai_mode', label: 'AI Mode', kind: 'bool' },
  { key: 'conversation_status', label: 'Conversation', kind: 'text' },
  { key: 'assigned_to', label: 'Assigned To', kind: 'text' },
  { key: 'last_inbound_at', label: 'Last Inbound', kind: 'date' },
  { key: 'last_outbound_at', label: 'Last Outbound', kind: 'date' },
  { key: 'last_message_at', label: 'Last Message', kind: 'date' },
  { key: 'last_message_direction', label: 'Last Direction', kind: 'text' },
  { key: 'created_at', label: 'Created At', kind: 'date' },
  { key: 'updated_at', label: 'Updated At', kind: 'date' },
  { key: 'last_classified_at', label: 'Last Classified', kind: 'date' },
];

export default function LeadTable({ title, filter, fullTable = false }: LeadTableProps) {
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<LeadRow | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // The /dashboard/lost view gets one extra column (lead_lost_factor); no other
  // compact view shows it.
  const isLost = filter === 'Lost';

  // Scroll the full-table viewport one "page" left/right via the side buttons.
  const scrollByPage = useCallback((dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(320, el.clientWidth * 0.8), behavior: 'smooth' });
  }, []);

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/dashboard/leads?filter=${encodeURIComponent(filter)}`,
        { cache: 'no-store' },
      );
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as LeadRow[];
      setRows(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    fetchLeads();
    const id = setInterval(fetchLeads, POLL_MS);
    return () => clearInterval(id);
  }, [fetchLeads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const name = (r.full_name ?? '').toLowerCase();
      const phone = r.phone.toLowerCase();
      return name.includes(q) || phone.includes(q);
    });
  }, [rows, search]);

  return (
    <div className="flex h-full flex-col p-4 sm:p-6">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {/* Header */}
        <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-emerald-100 px-2 text-xs font-bold text-emerald-700">
              {filtered.length}
            </span>
          </div>
          <div className="relative sm:w-72">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.3-4.3M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or phone…"
              className="w-full rounded-xl border border-transparent bg-gray-100 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-200"
            />
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-auto">
          {loading && rows.length === 0 ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex animate-pulse items-center gap-4">
                  <div className="h-3 w-1/4 rounded bg-gray-200" />
                  <div className="h-3 w-1/5 rounded bg-gray-100" />
                  <div className="h-3 w-1/6 rounded bg-gray-100" />
                  <div className="h-3 w-1/5 rounded bg-gray-100" />
                </div>
              ))}
            </div>
          ) : error && rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-red-500">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-gray-300">
                <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 19.5a7.5 7.5 0 0 1 15 0v.75H4.5v-.75Z" />
                </svg>
              </div>
              <span className="text-sm text-gray-400">
                {search ? 'No matching leads' : 'No leads in this view yet'}
              </span>
            </div>
          ) : fullTable ? (
            /* Full leads table — every column, horizontally scrollable with
               ◀ / ▶ buttons on both sides. Used by /dashboard/leads & /today. */
            <div className="flex h-full flex-col">
              {/* Scroll controls — a button on each side. */}
              <div className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-gray-100 bg-white px-3 py-2">
                <button
                  type="button"
                  onClick={() => scrollByPage(-1)}
                  aria-label="Scroll left"
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                >
                  <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                  </svg>
                  Scroll left
                </button>
                <span className="hidden text-xs text-gray-400 sm:inline">
                  Scroll to see all columns
                </span>
                <button
                  type="button"
                  onClick={() => scrollByPage(1)}
                  aria-label="Scroll right"
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                >
                  Scroll right
                  <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              </div>

              {/* Horizontally scrollable viewport (driven by the buttons above). */}
              <div ref={scrollRef} className="min-h-0 flex-1 overflow-x-auto">
                <table className="w-full min-w-[2200px] border-collapse text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                    <tr>
                      {FULL_COLUMNS.map((col) => (
                        <th key={String(col.key)} className="whitespace-nowrap px-4 py-3 font-semibold">
                          {col.label}
                        </th>
                      ))}
                      <th className="sticky right-0 bg-gray-50 px-4 py-3 text-right font-semibold">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((r) => (
                      <tr key={r.phone} className="transition-colors hover:bg-emerald-50/40">
                        {FULL_COLUMNS.map((col) => {
                          const raw = r[col.key];
                          let cell: React.ReactNode;
                          if (col.kind === 'status') {
                            cell = <LeadStatusBadge status={r.lead_status} reason={r.lead_reason} />;
                          } else if (col.kind === 'date') {
                            cell = (
                              <span className="whitespace-nowrap text-gray-500">
                                {fmtDate(raw as string | null | undefined)}
                              </span>
                            );
                          } else if (col.kind === 'bool') {
                            cell = <span className="text-gray-600">{fmtBool(raw as boolean | null | undefined)}</span>;
                          } else {
                            cell = (
                              <span
                                className="block max-w-[260px] truncate text-gray-700"
                                title={typeof raw === 'string' ? raw : undefined}
                              >
                                {fmtText(raw as string | null | undefined)}
                              </span>
                            );
                          }
                          return (
                            <td key={String(col.key)} className="px-4 py-3 align-top">
                              {cell}
                            </td>
                          );
                        })}
                        <td className="sticky right-0 bg-white px-4 py-3 align-top">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/main/chat?phone=${encodeURIComponent(r.phone)}`}
                              className="whitespace-nowrap rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
                            >
                              Open Chat
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <>
              {/* Desktop / tablet: full table (horizontal scroll only as a last resort). */}
              <table className="hidden w-full min-w-[900px] border-collapse text-left text-sm lg:table">
                <thead className="sticky top-0 z-10 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Phone</th>
                    <th className="px-4 py-3 font-semibold">Full Name</th>
                    <th className="px-4 py-3 font-semibold">Lead Status</th>
                    <th className="px-4 py-3 font-semibold">Reason</th>
                    <th className="px-4 py-3 font-semibold">Created At</th>
                    <th className="px-4 py-3 font-semibold">Updated At</th>
                    {isLost && <th className="px-4 py-3 font-semibold">Lost Reason</th>}
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((r) => (
                    <tr key={r.phone} className="transition-colors hover:bg-emerald-50/40">
                      <td className="px-4 py-3 text-gray-600">{r.phone}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {r.full_name || <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <LeadStatusBadge status={r.lead_status} reason={r.lead_reason} />
                      </td>
                      <td className="max-w-[260px] px-4 py-3 text-gray-600">
                        {r.lead_reason ? (
                          <span className="block truncate" title={r.lead_reason}>
                            {r.lead_reason}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-500">{fmtDate(r.created_at)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-500">{fmtDate(r.updated_at)}</td>
                      {isLost && (
                        <td className="max-w-[260px] px-4 py-3 text-gray-600">
                          {r.lead_lost_factor ? (
                            <span className="block truncate" title={r.lead_lost_factor}>
                              {r.lead_lost_factor}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setSelected(r)}
                            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                          >
                            View
                          </button>
                          <Link
                            href={`/main/chat?phone=${encodeURIComponent(r.phone)}`}
                            className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
                          >
                            Open Chat
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Phone / small tablet: stacked cards — no horizontal scroll. */}
              <ul className="divide-y divide-gray-100 lg:hidden">
                {filtered.map((r) => (
                  <li key={r.phone} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-gray-900">
                          {r.full_name || <span className="text-gray-400">Unnamed lead</span>}
                        </p>
                        <p className="mt-0.5 text-sm text-gray-500">{r.phone}</p>
                      </div>
                      <LeadStatusBadge status={r.lead_status} reason={r.lead_reason} />
                    </div>

                    {r.lead_reason && (
                      <p className="mt-2 rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs text-gray-600">
                        {r.lead_reason}
                      </p>
                    )}

                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                      <div>
                        <dt className="text-gray-400">Created</dt>
                        <dd className="text-gray-700">{fmtDate(r.created_at)}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-400">Updated</dt>
                        <dd className="text-gray-700">{fmtDate(r.updated_at)}</dd>
                      </div>
                      {isLost && (
                        <div className="col-span-2">
                          <dt className="text-gray-400">Lost Reason</dt>
                          <dd className="text-gray-700">{r.lead_lost_factor || '—'}</dd>
                        </div>
                      )}
                    </dl>

                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() => setSelected(r)}
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                      >
                        View
                      </button>
                      <Link
                        href={`/main/chat?phone=${encodeURIComponent(r.phone)}`}
                        className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-center text-xs font-semibold text-white transition hover:bg-emerald-700"
                      >
                        Open Chat
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <LeadDetailDrawer lead={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
