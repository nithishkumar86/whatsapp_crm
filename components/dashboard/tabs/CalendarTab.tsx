'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Calendar tab.
 *
 * Shows ONE large month at a time, defaulting to the current month. The header
 * has the month/year on the left with ‹ › arrows to step backward/forward —
 * clicking an arrow replaces the page with that month. Every month is still
 * reachable by navigating; data is fetched per visible month (handles year
 * boundaries cleanly).
 *
 * Below the calendar grid, ALL appointments in the visible month are listed
 * automatically — grouped by date, sorted chronologically. No click-to-select-day.
 *
 * Status colors: scheduled = blue, confirmed = green, cancelled = red,
 * completed = gray.
 *
 * Data comes from GET /api/appointments only.
 */

interface Appointment {
  id: string;
  phone: string;
  full_name: string | null;
  visit_date: string; // YYYY-MM-DD
  visit_time: string; // HH:MM:SS
  location_preference: string | null;
  map_link: string | null;
  notes: string | null;
  booked_by: string | null;
  status: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function statusColor(status: string): string {
  switch (status) {
    case 'scheduled':
      return 'bg-blue-500';
    case 'confirmed':
      return 'bg-green-500';
    case 'cancelled':
      return 'bg-red-500';
    case 'completed':
      return 'bg-gray-400';
    default:
      return 'bg-gray-300';
  }
}

function statusTextColor(status: string): string {
  switch (status) {
    case 'scheduled':
      return 'text-blue-600';
    case 'confirmed':
      return 'text-green-600';
    case 'cancelled':
      return 'text-red-600';
    case 'completed':
      return 'text-gray-500';
    default:
      return 'text-gray-500';
  }
}

/**
 * Build a reliably-clickable Google Maps URL from the stored map_link.
 * The customer may share a full Maps URL OR a plain written address. If it's
 * already an http(s) URL we use it as-is; otherwise we wrap the text in a
 * Google Maps search query so the link always opens to the right place.
 */
function mapHref(link: string): string {
  const v = link.trim();
  if (/^https?:\/\//i.test(v)) return v;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v)}`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

// The three statuses an admin can manually set on an appointment.
const EDITABLE_STATUSES: { value: string; label: string }[] = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function CalendarTab() {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(
    today.getDate(),
  )}`;

  // Visible month — defaults to the current month.
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-11

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Big custom hover card — tracks the hovered appointment and cursor position.
  // Rendered fixed at the top level so it escapes the calendar's overflow-hidden.
  const [hovered, setHovered] = useState<{ appt: Appointment; x: number; y: number } | null>(null);

  // Inline status editor state — only one appointment editor open at a time.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  async function updateStatus(id: string, status: string) {
    setSavingId(id);
    setStatusError(null);
    try {
      const res = await fetch(`/api/appointments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || `Server error ${res.status}`);
      }
      // Optimistic update: replace the matching appointment's status in state.
      setAppointments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status } : a)),
      );
      setEditingId(null);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSavingId(null);
    }
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun

  // Fetch appointments for the visible month only.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const last = new Date(viewYear, viewMonth + 1, 0).getDate();
      const from = `${viewYear}-${pad(viewMonth + 1)}-01`;
      const to = `${viewYear}-${pad(viewMonth + 1)}-${pad(last)}`;
      const res = await fetch(`/api/appointments?from=${from}&to=${to}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const data = (await res.json()) as Appointment[];
      setAppointments(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [viewYear, viewMonth]);

  useEffect(() => {
    load();
  }, [load]);

  // Map of YYYY-MM-DD → appointments[].
  const byDate = useMemo(() => {
    const m = new Map<string, Appointment[]>();
    for (const a of appointments) {
      const arr = m.get(a.visit_date) ?? [];
      arr.push(a);
      m.set(a.visit_date, arr);
    }
    return m;
  }, [appointments]);

  // Sorted list of date keys that have appointments this month.
  const sortedDateKeys = useMemo(
    () => Array.from(byDate.keys()).sort(),
    [byDate],
  );

  function goPrev() {
    setViewMonth((m) => {
      if (m === 0) {
        setViewYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  }

  function goNext() {
    setViewMonth((m) => {
      if (m === 11) {
        setViewYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  }

  function goToday() {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  }

  const isCurrentMonth =
    viewYear === today.getFullYear() && viewMonth === today.getMonth();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      {/* Header: month/year + arrows on the left, legend on the right */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={goPrev}
            aria-label="Previous month"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:bg-gray-50 hover:text-gray-900"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>

          <div className="min-w-[180px] text-center sm:text-left">
            <h2 className="text-xl font-bold text-gray-900">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </h2>
          </div>

          <button
            onClick={goNext}
            aria-label="Next month"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:bg-gray-50 hover:text-gray-900"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>

          {!isCurrentMonth && (
            <button
              onClick={goToday}
              className="ml-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
            >
              Today
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <Legend color="bg-blue-500" label="scheduled" />
          <Legend color="bg-green-500" label="confirmed" />
          <Legend color="bg-red-500" label="cancelled" />
          <Legend color="bg-gray-400" label="completed" />
        </div>
      </div>

      {error ? (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      ) : (
        <>
          {/* Calendar grid */}
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            {/* Weekday header row */}
            <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50 text-center text-xs font-semibold text-gray-500">
              {WEEKDAYS.map((w) => (
                <div key={w} className="py-2.5">
                  <span className="hidden sm:inline">{w}</span>
                  <span className="sm:hidden">{w.slice(0, 1)}</span>
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className={`grid grid-cols-7 ${loading ? 'opacity-50' : ''}`}>
              {cells.map((day, i) => {
                if (day === null) {
                  return <div key={`e${i}`} className="min-h-[80px] border-b border-r border-gray-100 bg-gray-50/40 sm:min-h-[104px]" />;
                }
                const dateKey = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
                const appts = byDate.get(dateKey) ?? [];
                const isToday = dateKey === todayKey;
                return (
                  <div
                    key={dateKey}
                    className="min-h-[80px] border-b border-r border-gray-100 p-1.5 text-left align-top hover:bg-emerald-50/60 sm:min-h-[104px] sm:p-2"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                          isToday
                            ? 'bg-emerald-600 text-white'
                            : 'text-gray-700'
                        }`}
                      >
                        {day}
                      </span>
                      {appts.length > 0 && (
                        <span className="rounded-full bg-gray-100 px-1.5 text-[10px] font-semibold text-gray-600">
                          {appts.length}
                        </span>
                      )}
                    </div>

                    {/* Up to 3 appointment chips, then "+N more" */}
                    <div className="mt-1 space-y-1">
                      {appts.slice(0, 3).map((a) => (
                        <div
                          key={a.id}
                          onMouseEnter={(e) => setHovered({ appt: a, x: e.clientX, y: e.clientY })}
                          onMouseMove={(e) => setHovered({ appt: a, x: e.clientX, y: e.clientY })}
                          onMouseLeave={() => setHovered(null)}
                          className="flex cursor-help items-center gap-1 truncate rounded text-[10px] leading-tight text-gray-600 hover:bg-emerald-100/70"
                        >
                          <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${statusColor(a.status)}`} />
                          <span className="truncate">
                            {a.visit_time?.slice(0, 5)} {a.full_name || a.phone}
                          </span>
                        </div>
                      ))}
                      {appts.length > 3 && (
                        <div className="text-[10px] font-medium text-gray-400">
                          +{appts.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Month appointment list — always visible, auto-updates with month navigation */}
          <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <h3 className="text-sm font-semibold text-gray-900">
                Appointments in {MONTH_NAMES[viewMonth]} {viewYear}
              </h3>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                {appointments.length}
              </span>
            </div>

            {appointments.length === 0 ? (
              <div className="py-4 text-center text-sm text-gray-400">
                No appointments in {MONTH_NAMES[viewMonth]} {viewYear}
              </div>
            ) : (
              <div className="max-h-[480px] overflow-y-auto pr-1">
                <ul className="space-y-4">
                  {sortedDateKeys.map((dateKey) => {
                    const dayAppts = byDate.get(dateKey) ?? [];
                    // Sort appointments within the day by visit_time
                    const sorted = [...dayAppts].sort((a, b) =>
                      (a.visit_time || '').localeCompare(b.visit_time || ''),
                    );
                    return (
                      <li key={dateKey}>
                        {/* Date subheading */}
                        <div className="mb-2 flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            {dateKey}
                          </span>
                          <span className="rounded-full bg-gray-100 px-1.5 text-[10px] font-semibold text-gray-500">
                            {sorted.length}
                          </span>
                        </div>

                        <ul className="space-y-2">
                          {sorted.map((a) => (
                            <li
                              key={a.id}
                              className="rounded-xl border border-gray-100 px-4 py-3 transition hover:border-gray-200 hover:shadow-sm"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${statusColor(a.status)}`} />
                                  <span className="text-sm font-semibold text-gray-900">
                                    {a.full_name || a.phone}
                                  </span>
                                </div>

                                {/* Status pill + Edit toggle */}
                                <div className="flex flex-shrink-0 items-center gap-2">
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusTextColor(a.status)}`}
                                  >
                                    {a.status}
                                  </span>
                                  <button
                                    onClick={() => {
                                      setStatusError(null);
                                      setEditingId(editingId === a.id ? null : a.id);
                                    }}
                                    disabled={savingId === a.id}
                                    className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 transition hover:bg-gray-200 disabled:opacity-50"
                                  >
                                    {editingId === a.id ? 'Close' : 'Edit'}
                                  </button>
                                </div>
                              </div>

                              {/* Inline status editor — shown only for the active appointment */}
                              {editingId === a.id && (
                                <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                                  <p className="mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                    Change status
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    {EDITABLE_STATUSES.map(({ value, label }) => {
                                      const isActive = a.status === value;
                                      const isSaving = savingId === a.id;
                                      return (
                                        <button
                                          key={value}
                                          onClick={() => {
                                            if (!isActive) updateStatus(a.id, value);
                                          }}
                                          disabled={isSaving || isActive}
                                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition
                                            ${isActive
                                              ? `${statusTextColor(value)} bg-white border-2 border-current opacity-80 cursor-default`
                                              : 'bg-white border border-gray-200 text-gray-700 hover:border-gray-400 hover:text-gray-900'}
                                            disabled:opacity-60 disabled:cursor-not-allowed`}
                                        >
                                          {label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  {savingId === a.id && (
                                    <p className="mt-2 text-xs text-gray-400">Saving...</p>
                                  )}
                                  {statusError && editingId === a.id && (
                                    <p className="mt-2 text-xs font-medium text-red-600">
                                      {statusError}
                                    </p>
                                  )}
                                </div>
                              )}

                              <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                                <Detail label="Name" value={a.full_name || '—'} />
                                <Detail label="Phone" value={a.phone} />
                                <Detail label="Date" value={a.visit_date} />
                                <Detail label="Time" value={a.visit_time?.slice(0, 5) || '—'} />
                                <Detail label="Location" value={a.location_preference || '—'} />
                              </dl>

                              <div className="mt-2 flex flex-wrap gap-2">
                                {a.map_link ? (
                                  <a
                                    href={mapHref(a.map_link)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth={1.8}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                                    </svg>
                                    Open Google Maps
                                  </a>
                                ) : (
                                  <span className="inline-flex items-center rounded-lg bg-gray-50 px-2.5 py-1 text-xs text-gray-400">
                                    No map link
                                  </span>
                                )}
                                <a
                                  href={`tel:${a.phone}`}
                                  className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
                                >
                                  Call
                                </a>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </>
      )}

      {/* Big hover card — follows the cursor, escapes overflow via fixed positioning. */}
      {hovered && (
        <div
          className="pointer-events-none fixed z-50 w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-2xl"
          style={{
            left: Math.min(hovered.x + 16, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 304),
            top: hovered.y + 16,
          }}
        >
          <div className="mb-2 flex items-center gap-2">
            <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${statusColor(hovered.appt.status)}`} />
            <span className="text-base font-bold text-gray-900">
              {hovered.appt.full_name || hovered.appt.phone}
            </span>
            <span className={`ml-auto text-xs font-medium ${statusTextColor(hovered.appt.status)}`}>
              {hovered.appt.status}
            </span>
          </div>
          <div className="space-y-1.5 text-sm">
            <HoverRow icon="📞" label="Phone" value={hovered.appt.phone} />
            <HoverRow icon="📅" label="Date" value={hovered.appt.visit_date} />
            <HoverRow icon="🕑" label="Time" value={hovered.appt.visit_time?.slice(0, 5) || '—'} />
            <HoverRow icon="📍" label="Location" value={hovered.appt.location_preference || '—'} />
            <HoverRow
              icon="🗺"
              label="Google Map"
              value={hovered.appt.map_link || 'No map link shared'}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Single labeled row inside the big hover card.
function HoverRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="flex-shrink-0">{icon}</span>
      <span className="flex-shrink-0 font-medium text-gray-400">{label}:</span>
      <span className="break-all text-gray-800">{value}</span>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="font-medium text-gray-400">{label}:</dt>
      <dd className="truncate text-gray-700">{value}</dd>
    </div>
  );
}
// helper components above are module-scoped (hoisted), used by CalendarTab.

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-gray-500">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}
