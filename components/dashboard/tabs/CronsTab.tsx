'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Crons tab.
 *
 * Three cron cards. Each shows: name, schedule expression, last ran time,
 * last status, and messages sent on the most recent run. Data comes from
 * GET /api/cron-logs.
 */

interface CronLog {
  id: string;
  cron_name: string;
  status: string;
  messages_sent: number;
  error_message: string | null;
  ran_at: string;
}

interface CronDef {
  key: string;
  title: string;
  schedule: string;
  description: string;
}

const CRONS: CronDef[] = [
  {
    key: 'daily_template',
    title: 'Daily Re-engagement',
    schedule: '0 9 * * *  (9:00 AM IST)',
    description: 'Leads idle > 24h with AI mode on.',
  },
  {
    key: 'tomorrow_reminder',
    title: 'Tomorrow Site Visit Reminder',
    schedule: '0 8 * * *  (8:00 AM IST)',
    description: 'Appointments scheduled for tomorrow.',
  },
  {
    key: 'hourly_reminder',
    title: '1 Hour Before Visit Reminder',
    schedule: '0 * * * *  (every hour)',
    description: 'Appointments starting in ~1 hour.',
  },
];

function formatDateTime(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Never';
  return d.toLocaleString([], {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CronsTab() {
  const [logs, setLogs] = useState<CronLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/cron-logs', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const data = (await res.json()) as CronLog[];
      setLogs(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cron logs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Latest log per cron_name (logs are already ordered ran_at desc).
  const latestByName = useMemo(() => {
    const m = new Map<string, CronLog>();
    for (const l of logs) {
      if (!m.has(l.cron_name)) m.set(l.cron_name, l);
    }
    return m;
  }, [logs]);

  return (
    <div className="mx-auto h-full max-w-5xl overflow-y-auto px-4 py-6 sm:px-6">
      <div className="mb-5">
        <h2 className="text-xl font-bold text-gray-900">Scheduled Jobs</h2>
        <p className="mt-1 text-sm text-gray-500">
          Automated WhatsApp follow-ups, running in Asia/Kolkata.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl border border-gray-100 bg-gray-50" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {CRONS.map((c) => {
            const last = latestByName.get(c.key);
            const ok = last?.status === 'success';
            return (
              <div
                key={c.key}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md"
              >
                <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 to-green-600" />
                <div className="p-5">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75v5.25l3 1.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                        </svg>
                      </div>
                      <h3 className="text-sm font-semibold leading-tight text-gray-900">
                        {c.title}
                      </h3>
                    </div>
                    <span
                      className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        !last
                          ? 'bg-gray-100 text-gray-500'
                          : ok
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {last ? last.status : 'idle'}
                    </span>
                  </div>
                  <p className="mb-3 text-xs text-gray-400">{c.description}</p>

                  <dl className="space-y-1.5 border-t border-gray-100 pt-3 text-xs">
                    <div className="flex justify-between">
                      <dt className="text-gray-400">Schedule</dt>
                      <dd className="font-mono text-gray-700">{c.schedule}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-400">Last ran</dt>
                      <dd className="text-gray-700">
                        {formatDateTime(last?.ran_at ?? null)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-400">Messages sent</dt>
                      <dd className="font-semibold text-gray-900">
                        {last?.messages_sent ?? 0}
                      </dd>
                    </div>
                  </dl>

                  {last?.error_message && (
                    <div className="mt-3 rounded-lg bg-red-50 p-2 text-[11px] text-red-600">
                      {last.error_message}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
