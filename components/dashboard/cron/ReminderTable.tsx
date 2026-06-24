'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Cron PERMANENT RUN-LOG table.
 *
 * Polls the variant's endpoint every ~5s (cache:'no-store'). The API returns
 * only appointments the matching cron has actually PROCESSED (run_at set),
 * newest-run-first. Each row shows the run result — green "Sent" on success,
 * red "Failed" on a send error — plus the local datetime the cron reminded
 * that appointment. Rows persist forever.
 *
 * Browser never talks to Supabase — all data comes from the API route.
 */

type Variant = 'daily' | 'hourly';

type ReminderResult = 'sent' | 'failed' | null;

interface ReminderRow {
  phone: string;
  full_name: string | null;
  visit_date: string;
  visit_time: string | null;
  location_preference: string | null;
  status: string | null;
  reminder_1day_run_at?: string | null;
  reminder_1day_result?: ReminderResult;
  reminder_1hr_run_at?: string | null;
  reminder_1hr_result?: ReminderResult;
}

interface ReminderTableProps {
  variant: Variant;
}

const POLL_MS = 5000;

const CONFIG: Record<
  Variant,
  {
    endpoint: string;
    title: string;
    runAtKey: 'reminder_1day_run_at' | 'reminder_1hr_run_at';
    resultKey: 'reminder_1day_result' | 'reminder_1hr_result';
  }
> = {
  daily: {
    endpoint: '/api/cron/dailyremin',
    title: 'Daily Reminder — Cron Run Log',
    runAtKey: 'reminder_1day_run_at',
    resultKey: 'reminder_1day_result',
  },
  hourly: {
    endpoint: '/api/cron/hrremin',
    title: 'Hourly Reminder — Cron Run Log',
    runAtKey: 'reminder_1hr_run_at',
    resultKey: 'reminder_1hr_result',
  },
};

function fmtTime(t: string | null): string {
  if (!t) return '—';
  // visit_time is HH:MM[:SS] — show HH:MM.
  return t.slice(0, 5) || t;
}

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

function ResultBadge({ result }: { result: ReminderResult }) {
  if (result === 'sent') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
        <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
        Sent
      </span>
    );
  }
  if (result === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
        <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">
      —
    </span>
  );
}

export default function ReminderTable({ variant }: ReminderTableProps) {
  const { endpoint, title, runAtKey, resultKey } = CONFIG[variant];

  const [rows, setRows] = useState<ReminderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    try {
      const res = await fetch(endpoint, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as ReminderRow[];
      setRows(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reminders');
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

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
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-emerald-100 px-2 text-xs font-bold text-emerald-700">
              {rows.length}
            </span>
          </div>
          <span className="text-xs font-medium text-gray-500">
            {rows.length} cron {rows.length === 1 ? 'run' : 'runs'} recorded
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
                    d="M6.75 3v2.25M17.25 3v2.25M3.75 8.25h16.5M4.5 5.25h15a.75.75 0 0 1 .75.75v12.75a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5V6a.75.75 0 0 1 .75-.75Z"
                  />
                </svg>
              </div>
              <span className="text-sm text-gray-400">No cron runs recorded yet</span>
            </div>
          ) : (
            <>
              {/* Desktop / tablet: full table (horizontal scroll only as a last resort). */}
              <table className="hidden w-full min-w-[900px] border-collapse text-left text-sm lg:table">
                <thead className="sticky top-0 z-10 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Phone</th>
                    <th className="px-4 py-3 font-semibold">Full Name</th>
                    <th className="px-4 py-3 font-semibold">Visit Date</th>
                    <th className="px-4 py-3 font-semibold">Visit Time</th>
                    <th className="px-4 py-3 font-semibold">Location</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Reminded At</th>
                    <th className="px-4 py-3 font-semibold">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r, i) => (
                    <tr key={`${r.phone}-${i}`} className="transition-colors hover:bg-emerald-50/40">
                      <td className="px-4 py-3 text-gray-600">{r.phone}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {r.full_name || <span className="text-gray-400">—</span>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600">{r.visit_date}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600">{fmtTime(r.visit_time)}</td>
                      <td className="max-w-[240px] px-4 py-3 text-gray-600">
                        {r.location_preference ? (
                          <span className="block truncate" title={r.location_preference}>
                            {r.location_preference}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 capitalize text-gray-600">
                        {r.status || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                        {fmtRunAt(r[runAtKey])}
                      </td>
                      <td className="px-4 py-3">
                        <ResultBadge result={r[resultKey] ?? null} />
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
                      <ResultBadge result={r[resultKey] ?? null} />
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                      <div>
                        <dt className="text-gray-400">Visit Date</dt>
                        <dd className="text-gray-700">{r.visit_date}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-400">Visit Time</dt>
                        <dd className="text-gray-700">{fmtTime(r.visit_time)}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-400">Status</dt>
                        <dd className="capitalize text-gray-700">{r.status || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-400">Reminded At</dt>
                        <dd className="text-gray-700">{fmtRunAt(r[runAtKey])}</dd>
                      </div>
                      <div className="col-span-2 min-w-0">
                        <dt className="text-gray-400">Location</dt>
                        <dd className="truncate text-gray-700" title={r.location_preference || undefined}>
                          {r.location_preference || '—'}
                        </dd>
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
