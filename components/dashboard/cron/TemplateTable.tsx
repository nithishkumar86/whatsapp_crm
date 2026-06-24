'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Per-lead template-message log table.
 *
 * Polls /api/cron/template every ~5s (cache:'no-store'). The API returns one row
 * per lead that has ever been sent a WhatsApp template, newest `last_sent_at`
 * first, with the lead's full_name merged in. Each row shows whether a template
 * was sent, the LAST template name, the running total sent, and the datetime of
 * the last send.
 *
 * Browser never talks to Supabase — all data comes from the API route.
 */

interface TemplateRow {
  phone: string;
  full_name: string | null;
  template_sent: boolean;
  template_name: string | null;
  total_template_sent: number;
  last_sent_at: string | null;
}

const ENDPOINT = '/api/cron/template';
const TITLE = 'Template Messages — Per-Lead Log';
const POLL_MS = 5000;

function fmtRunAt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function SentBadge({ sent }: { sent: boolean }) {
  if (sent) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
        <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
        Sent
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">
      Pending
    </span>
  );
}

function CountPill({ count }: { count: number }) {
  return (
    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-green-100 px-2 text-xs font-bold text-green-700">
      {count}
    </span>
  );
}

export default function TemplateTable() {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    try {
      const res = await fetch(ENDPOINT, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as TemplateRow[];
      setRows(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load template messages');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchRows();
    const id = setInterval(fetchRows, POLL_MS);
    return () => clearInterval(id);
  }, [fetchRows]);

  return (
    <div className="flex h-full flex-col p-4 sm:p-6">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {/* Header */}
        <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900">{TITLE}</h2>
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-emerald-100 px-2 text-xs font-bold text-emerald-700">
              {rows.length}
            </span>
          </div>
          <span className="text-xs font-medium text-gray-500">
            {rows.length} {rows.length === 1 ? 'lead' : 'leads'} tracked
          </span>
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
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-gray-300">
                <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" stroke="currentColor" strokeWidth={1.5}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z"
                  />
                </svg>
              </div>
              <span className="text-sm text-gray-400">No template sends recorded yet</span>
            </div>
          ) : (
            <>
              {/* Desktop / tablet: full table (horizontal scroll only as a last resort). */}
              <table className="hidden w-full min-w-[900px] border-collapse text-left text-sm lg:table">
                <thead className="sticky top-0 z-10 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Phone</th>
                    <th className="px-4 py-3 font-semibold">Full Name</th>
                    <th className="px-4 py-3 font-semibold">Template Sent</th>
                    <th className="px-4 py-3 font-semibold">Last Template</th>
                    <th className="px-4 py-3 font-semibold">Total Sent</th>
                    <th className="px-4 py-3 font-semibold">Last Sent At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r, i) => (
                    <tr key={`${r.phone}-${i}`} className="transition-colors hover:bg-emerald-50/40">
                      <td className="px-4 py-3 text-gray-600">{r.phone}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {r.full_name || <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <SentBadge sent={!!r.template_sent} />
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {r.template_name || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <CountPill count={r.total_template_sent ?? 0} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                        {fmtRunAt(r.last_sent_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Phone / small tablet: stacked cards — no horizontal scroll. */}
              <ul className="divide-y divide-gray-100 lg:hidden">
                {rows.map((r, i) => (
                  <li key={`${r.phone}-${i}`} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-gray-900">
                          {r.full_name || <span className="text-gray-400">Unnamed lead</span>}
                        </p>
                        <p className="mt-0.5 text-sm text-gray-500">{r.phone}</p>
                      </div>
                      <SentBadge sent={!!r.template_sent} />
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                      <div className="col-span-2 min-w-0">
                        <dt className="text-gray-400">Last Template</dt>
                        <dd className="truncate text-gray-700" title={r.template_name || undefined}>
                          {r.template_name || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-gray-400">Total Sent</dt>
                        <dd className="text-gray-700">
                          <CountPill count={r.total_template_sent ?? 0} />
                        </dd>
                      </div>
                      <div>
                        <dt className="text-gray-400">Last Sent At</dt>
                        <dd className="text-gray-700">{fmtRunAt(r.last_sent_at)}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
