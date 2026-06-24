import Link from 'next/link';
import DashboardSidebar from '@/components/dashboard/admin/DashboardSidebar';

/**
 * Shared chrome for every /dashboard/* route (the admin lead command center).
 *
 * Left: fixed icon sidebar (Leads | Today | New | Active | Progress | Lost |
 * Successful + Logout). Right: a header band + the active filtered table.
 *
 * Auth is enforced by middleware — unauthenticated requests redirect to '/'.
 * All data flows through /api/dashboard/* routes (service-role only).
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-100">
      <DashboardSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between bg-gradient-to-r from-emerald-600 to-green-700 px-4 py-3 text-white shadow-sm sm:px-5">
          <h1 className="text-sm font-semibold tracking-tight sm:text-base">
            Digital Tamizha <span className="hidden sm:inline">— Lead Dashboard</span>
          </h1>
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
        </header>
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
