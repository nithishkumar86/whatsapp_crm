'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LOST_FACTORS, LEAD_STATUSES } from '@/lib/lead-constants';
import PieChart, { PieDatum } from '@/components/analytics/PieChart';

/**
 * /analytics — Lead Analytics.
 *
 * Two pie charts switched by icon buttons:
 *   • Lead Lost Insights — distribution of lead_lost_factor for Lost leads.
 *   • Overall Leads      — count of leads per non-Lost status.
 *
 * Reads live from /api/dashboard/analytics on mount and polls every 30s so the
 * daily classifier updates surface automatically. Auth is enforced by
 * middleware; all data flows through the API route (service-role only).
 */

const POLL_MS = 30000;

type View = 'lost' | 'overall';

interface AnalyticsResponse {
  month: string;
  months: string[];
  lostFactors: { factor: string; count: number }[];
  statusCounts: { status: string; count: number }[];
  totalLost: number;
}

/** "06" → "June" for the month <select> labels (year-independent). */
function formatMonth(m: string): string {
  return new Date(`2000-${m}-01T00:00:00`).toLocaleString('en-US', {
    month: 'long',
  });
}

// 10 clearly distinct colors for the Lost factors (in LOST_FACTORS order).
// Warm/cool interleaved so neighbouring slices never look alike, and all are
// dark enough that the white in-slice labels stay readable.
const LOST_COLORS = [
  '#dc2626', // Not Interested              — red
  '#0891b2', // Budget / Expectation Mismatch — cyan
  '#ea580c', // Competitor Chosen           — orange
  '#2563eb', // No Response                 — blue
  '#ca8a04', // Invalid Number              — gold
  '#7c3aed', // Duplicate Lead              — violet
  '#16a34a', // Ghosted                     — green
  '#db2777', // Tire Kicker                 — pink
  '#0d9488', // Land Ownership Issue        — teal
  '#64748b', // Other                       — slate
];

// 4 clearly distinct colors for the non-Lost statuses, in order:
// New = blue, Active = amber, Progress = violet, Successful = green.
const STATUS_COLORS = ['#3b82f6', '#f59e0b', '#8b5cf6', '#22c55e'];

// Sidebar view switcher entries — one icon each, switches the main chart.
const VIEWS: { key: View; label: string; icon: React.ReactNode }[] = [
  {
    key: 'lost',
    label: 'Lead Lost Insights',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-9-9v9h9Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 3.5A9 9 0 0 1 20.5 10H14V3.5Z" />
      </svg>
    ),
  },
  {
    key: 'overall',
    label: 'Overall Leads',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M6 21V10m6 11V4m6 17v-7" />
      </svg>
    ),
  },
];

export default function AnalyticsPage() {
  const [view, setView] = useState<View>('lost');
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [months, setMonths] = useState<string[]>([]);

  const fetchAnalytics = useCallback(async () => {
    try {
      const url = selectedMonth
        ? `/api/dashboard/analytics?month=${selectedMonth}`
        : '/api/dashboard/analytics';
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = (await res.json()) as AnalyticsResponse;
      setData(json);
      setMonths(json.months);
      // First load: adopt the server's default month so the select shows it.
      if (selectedMonth === '') setSelectedMonth(json.month);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    setLoading(true);
    fetchAnalytics();
    const id = setInterval(fetchAnalytics, POLL_MS);
    return () => clearInterval(id);
  }, [fetchAnalytics]);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/';
  }

  // Build the Lost-factor slices in LOST_FACTORS order, zipping API counts with
  // the palette. Falls back to a 0-count seed if the API row is missing.
  const lostData = useMemo<PieDatum[]>(() => {
    const byFactor = new Map(
      (data?.lostFactors ?? []).map((r) => [r.factor, r.count]),
    );
    return LOST_FACTORS.map((factor, i) => ({
      label: factor,
      value: byFactor.get(factor) ?? 0,
      color: LOST_COLORS[i % LOST_COLORS.length],
    }));
  }, [data]);

  const overallData = useMemo<PieDatum[]>(() => {
    const nonLost = LEAD_STATUSES.filter((s) => s !== 'Lost');
    const byStatus = new Map(
      (data?.statusCounts ?? []).map((r) => [r.status, r.count]),
    );
    return nonLost.map((status, i) => ({
      label: status,
      value: byStatus.get(status) ?? 0,
      color: STATUS_COLORS[i % STATUS_COLORS.length],
    }));
  }, [data]);

  const title = view === 'lost' ? 'Lead Lost Insights' : 'Overall Leads';

  return (
    <div className="flex min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* Left icon rail — switches the chart shown in the main view. */}
      <nav className="flex w-16 shrink-0 flex-col items-center justify-between bg-gradient-to-b from-emerald-800 to-green-900 py-4 text-white">
        <div className="flex flex-col items-center gap-6">
          {/* Brand mark */}
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-sm font-bold">
            DT
          </div>

          {/* View icons */}
          <ul className="flex flex-col items-center gap-3">
            {VIEWS.map((item) => {
              const active = view === item.key;
              return (
                <li key={item.key} className="group relative">
                  <button
                    type="button"
                    onClick={() => setView(item.key)}
                    aria-label={item.label}
                    aria-pressed={active}
                    className={`flex h-11 w-11 items-center justify-center rounded-xl transition-all ${
                      active
                        ? 'bg-white/90 text-green-700 shadow-md'
                        : 'text-green-100 hover:bg-white/15 hover:text-white'
                    }`}
                  >
                    {item.icon}
                  </button>

                  {/* Hover tooltip */}
                  <span className="pointer-events-none absolute left-full top-1/2 z-20 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
                    {item.label}
                    <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Logout pinned at the bottom */}
        <div className="group relative">
          <button
            onClick={handleLogout}
            aria-label="Logout"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-green-100 transition-all hover:bg-red-500/90 hover:text-white"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth={1.8}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6A2.25 2.25 0 0 0 5.25 5.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M18 15l3-3m0 0-3-3m3 3H9"
              />
            </svg>
          </button>
          <span className="pointer-events-none absolute left-full top-1/2 z-20 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
            Logout
            <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
          </span>
        </div>
      </nav>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between bg-gradient-to-r from-emerald-600 to-green-700 px-4 py-3 text-white shadow-sm sm:px-5">
          <h1 className="text-sm font-semibold tracking-tight sm:text-base">
            BRIQ Foundation <span className="hidden sm:inline">— Lead Analytics</span>
          </h1>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/home"
              className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/25 sm:text-sm"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 12 12 2.25 21.75 12M4.5 9.75v9.75a.75.75 0 0 0 .75.75H9.75v-6h4.5v6h4.5a.75.75 0 0 0 .75-.75V9.75"
                />
              </svg>
              Home
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 p-4 sm:p-8">
          {/* Month filter — applies to BOTH charts (IST creation month). */}
          <div className="mb-4 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
            <label
              htmlFor="analytics-month"
              className="text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Month
            </label>
            <select
              id="analytics-month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 sm:w-auto"
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {formatMonth(m)}
                </option>
              ))}
            </select>
          </div>

          {loading && !data ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-400 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500">
              Loading analytics…
            </div>
          ) : error && !data ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center text-sm text-red-500 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              {error}
            </div>
          ) : (
            <PieChart
              title={title}
              data={view === 'lost' ? lostData : overallData}
              size="lg"
            />
          )}
        </main>
      </div>
    </div>
  );
}
