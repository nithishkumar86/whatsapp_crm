'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Vertical icon rail for the /cron reminder-monitoring section.
 *
 * Two destinations (Daily Reminder, Hourly Reminder), each rendered as an icon
 * button. Hovering an icon reveals its label as a tooltip; clicking navigates
 * to the matching full-page route. The active route is highlighted. Logout sits
 * pinned at the bottom.
 */

type NavItem = {
  key: string;
  label: string;
  href: string;
  icon: React.ReactNode;
};

const NAV: NavItem[] = [
  {
    key: 'dailyremin',
    label: 'Daily Reminder',
    href: '/cron/dailyremin',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth={1.8}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M6.75 3v2.25M17.25 3v2.25M3.75 8.25h16.5M4.5 5.25h15a.75.75 0 0 1 .75.75v12.75a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5V6a.75.75 0 0 1 .75-.75Z"
        />
      </svg>
    ),
  },
  {
    key: 'hrremin',
    label: 'Hourly Reminder',
    href: '/cron/hrremin',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth={1.8}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6.75v5.25l3 1.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
        />
      </svg>
    ),
  },
  {
    key: 'template',
    label: 'Template Messages',
    href: '/cron/template',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth={1.8}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z"
        />
      </svg>
    ),
  },
];

export default function CronSidebar() {
  const pathname = usePathname();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/';
  }

  return (
    <nav className="flex h-full w-16 flex-col items-center justify-between bg-gradient-to-b from-emerald-800 to-green-900 py-4 text-white">
      {/* Brand mark */}
      <div className="flex flex-col items-center gap-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-sm font-bold">
          DT
        </div>

        {/* Nav icons */}
        <ul className="flex flex-col items-center gap-3">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <li key={item.key} className="group relative">
                <Link
                  href={item.href}
                  aria-label={item.label}
                  className={`flex h-11 w-11 items-center justify-center rounded-xl transition-all ${
                    active
                      ? 'bg-white/90 text-green-700 shadow-md'
                      : 'text-green-100 hover:bg-white/15 hover:text-white'
                  }`}
                >
                  {item.icon}
                </Link>

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
  );
}
