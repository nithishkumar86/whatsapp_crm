'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

/**
 * Vertical icon rail for the admin /dashboard section.
 *
 * Seven distinct destinations (Leads, Today, New, Active, Progress, Lost,
 * Successful), each an icon button with a hover tooltip + active highlight
 * (mirrors components/dashboard/Sidebar.tsx).
 *
 * Badges behave like phone notifications, NOT totals: each icon shows the
 * number of leads that became relevant to that view since the admin last
 * opened it. Opening a view marks it seen, so its badge clears to nothing —
 * exactly like a notification dot disappearing once you tap the app. The
 * "last seen" timestamp per view is kept in localStorage. Data comes from
 * GET /api/dashboard/counts (polled every ~5s). Logout pinned at the bottom.
 */

// localStorage key holding the per-view "last seen" timestamps (ms).
const SEEN_KEY = 'dt_dash_seen_v1';

type ViewKey = 'leads' | 'today' | 'new' | 'active' | 'progress' | 'lost' | 'successful';

const VIEW_KEYS: ViewKey[] = ['leads', 'today', 'new', 'active', 'progress', 'lost', 'successful'];

// Per-view membership + which timestamp marks a lead as "new" for that view.
// New leads (created_at) drive Leads/Today/New; a status change (updated_at)
// drives the status views. updated_at bumps on every row change via DB trigger,
// so it would be noisy for "new lead" detection — hence created_at there.
const VIEW_CONFIG: Record<
  ViewKey,
  { status?: string; today?: boolean; activity: 'created' | 'updated' }
> = {
  leads: { activity: 'created' },
  today: { today: true, activity: 'created' },
  new: { status: 'New', activity: 'created' },
  active: { status: 'Active', activity: 'updated' },
  progress: { status: 'Progress', activity: 'updated' },
  lost: { status: 'Lost', activity: 'updated' },
  successful: { status: 'Successful', activity: 'updated' },
};

interface NavItem {
  key: ViewKey;
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface LeadFeedRow {
  phone: string;
  lead_status: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface CountsResponse {
  todayBoundaryMs: number;
  leads: LeadFeedRow[];
}

type SeenMap = Record<ViewKey, number>;

const POLL_MS = 5000;

function nowSeenMap(): SeenMap {
  const n = Date.now();
  return { leads: n, today: n, new: n, active: n, progress: n, lost: n, successful: n };
}

/**
 * Load the per-view "last seen" map from localStorage. On first ever visit
 * (nothing stored) we baseline every view to "now" so the admin starts with a
 * clean slate — only leads arriving AFTER this point raise a badge, instead of
 * the whole existing backlog lighting up at once.
 */
function loadSeen(): SeenMap {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) {
      const fresh = nowSeenMap();
      localStorage.setItem(SEEN_KEY, JSON.stringify(fresh));
      return fresh;
    }
    const parsed = JSON.parse(raw) as Partial<Record<ViewKey, number>>;
    const merged = nowSeenMap();
    for (const k of VIEW_KEYS) {
      if (typeof parsed[k] === 'number') merged[k] = parsed[k] as number;
    }
    return merged;
  } catch {
    return nowSeenMap();
  }
}

function ts(value: string | null): number {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

const NAV: NavItem[] = [
  {
    key: 'leads',
    label: 'Leads',
    href: '/dashboard/leads',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.5a3 3 0 0 0-6 0M18 21a3.75 3.75 0 0 0-3-3.67M6 21a3.75 3.75 0 0 1 3-3.67M12 12.75a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm6-3.75a2.25 2.25 0 1 0 0-4.5M6 9a2.25 2.25 0 1 1 0-4.5" />
      </svg>
    ),
  },
  {
    key: 'today',
    label: 'Today',
    href: '/dashboard/today',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3.75 8.25h16.5M4.5 5.25h15a.75.75 0 0 1 .75.75v12.75a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5V6a.75.75 0 0 1 .75-.75Zm7.5 8.25h.008v.008H12V13.5Z" />
      </svg>
    ),
  },
  {
    key: 'new',
    label: 'New',
    href: '/dashboard/new',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    ),
  },
  {
    key: 'active',
    label: 'Active',
    href: '/dashboard/active',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h3.75l2.25-6 4.5 12 2.25-6h3.75" />
      </svg>
    ),
  },
  {
    key: 'progress',
    label: 'Progress',
    href: '/dashboard/progress',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5 9 8.25l3.75 3.75 7.5-7.5M20.25 4.5v4.5h-4.5" />
      </svg>
    ),
  },
  {
    key: 'lost',
    label: 'Lost',
    href: '/dashboard/lost',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
  },
  {
    key: 'successful',
    label: 'Successful',
    href: '/dashboard/successful',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
      </svg>
    ),
  },
];

export default function DashboardSidebar() {
  const pathname = usePathname();
  const [rows, setRows] = useState<LeadFeedRow[]>([]);
  const [todayMs, setTodayMs] = useState(0);
  const [seen, setSeen] = useState<SeenMap | null>(null);

  // Hydrate the "last seen" map once on the client (localStorage only exists here).
  useEffect(() => {
    setSeen(loadSeen());
  }, []);

  // Poll the lightweight lead feed.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/dashboard/counts', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as CountsResponse;
        if (!cancelled) {
          setRows(Array.isArray(data.leads) ? data.leads : []);
          setTodayMs(data.todayBoundaryMs ?? 0);
        }
      } catch {
        // Soft-fail: badges just won't update this tick.
      }
    }
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Opening a view marks it seen → its badge clears, like tapping a notification.
  // Re-runs on data refresh too, so the badge for the view you're on stays at 0.
  useEffect(() => {
    const seg = pathname.split('/')[2] as ViewKey | undefined;
    if (!seg || !VIEW_KEYS.includes(seg)) return;
    setSeen((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [seg]: Date.now() };
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify(next));
      } catch {
        // Non-fatal: badge state just won't persist across reloads.
      }
      return next;
    });
  }, [pathname, rows]);

  // Unseen ("notification") count per view = leads that became relevant to that
  // view after it was last opened.
  const unseen = useMemo<Record<ViewKey, number>>(() => {
    const result = {
      leads: 0, today: 0, new: 0, active: 0, progress: 0, lost: 0, successful: 0,
    } as Record<ViewKey, number>;
    if (!seen) return result;

    for (const key of VIEW_KEYS) {
      const cfg = VIEW_CONFIG[key];
      const since = seen[key];
      let n = 0;
      for (const row of rows) {
        if (cfg.status && row.lead_status !== cfg.status) continue;
        if (cfg.today && ts(row.created_at) < todayMs) continue;
        const activityMs = cfg.activity === 'created' ? ts(row.created_at) : ts(row.updated_at);
        if (activityMs > since) n += 1;
      }
      result[key] = n;
    }
    return result;
  }, [rows, seen, todayMs]);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/';
  }

  return (
    <nav className="flex h-full w-16 flex-col items-center justify-between bg-gradient-to-b from-emerald-800 to-green-900 py-4 text-white">
      <div className="flex flex-col items-center gap-6">
        {/* Brand mark */}
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-sm font-bold">
          DT
        </div>

        <ul className="flex flex-col items-center gap-3">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            const count = unseen[item.key];
            return (
              <li key={item.key} className="group relative">
                <Link
                  href={item.href}
                  aria-label={item.label}
                  className={`flex h-11 w-11 items-center justify-center rounded-xl transition-all ${
                    active
                      ? 'bg-white text-green-700 shadow-md'
                      : 'text-green-100 hover:bg-white/15 hover:text-white'
                  }`}
                >
                  {item.icon}
                </Link>

                {/* Notification badge — unseen leads only; clears once opened. */}
                {count > 0 && (
                  <span className="pointer-events-none absolute -right-1 -top-1 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow ring-2 ring-emerald-800">
                    {count > 99 ? '99+' : count}
                  </span>
                )}

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
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6A2.25 2.25 0 0 0 5.25 5.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M18 15l3-3m0 0-3-3m3 3H9" />
          </svg>
        </button>
        <span className="pointer-events-none absolute left-full top-1/2 z-20 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
          Logout
          <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
        </span>
      </div>
    </nav>
  );
}
