import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';

/**
 * Landing home page.
 *
 * Shown after a successful login (the login page forwards here by default).
 * Presents a centered hero with a grid of endpoint cards. Each card links to
 * a section of the CRM. Today only the WhatsApp dashboard is wired up; future
 * endpoint cards can be appended to the grid below.
 */

export default function Home() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-600 via-green-700 to-teal-800 px-4 py-12">
      {/* Site-wide light/dark switch — persists across every page. */}
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-4xl text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-green-700 text-xl font-bold text-white shadow-md">
          BF
        </div>

        <h1 className="mb-2 text-3xl font-bold text-white sm:text-4xl">
          Welcome to BRIQ Foundation CRM
        </h1>
        <p className="mb-10 text-sm text-emerald-100/90">
          Manage leads, run the AI chatbot, and automate follow-ups — all in one place.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/main"
            className="group flex flex-col items-center gap-3 rounded-2xl border border-white/20 bg-white/10 p-6 text-white shadow-lg backdrop-blur transition hover:-translate-y-1 hover:bg-white/20 hover:shadow-2xl"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 transition group-hover:bg-white/25">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                className="h-7 w-7"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"
                />
              </svg>
            </span>
            <span className="text-base font-semibold">Conversations</span>
            <span className="text-xs text-emerald-50/80">
              Open the lead conversations dashboard
            </span>
          </Link>

          <Link
            href="/dashboard"
            className="group flex flex-col items-center gap-3 rounded-2xl border border-white/20 bg-white/10 p-6 text-white shadow-lg backdrop-blur transition hover:-translate-y-1 hover:bg-white/20 hover:shadow-2xl"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 transition group-hover:bg-white/25">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-7 w-7"
                stroke="currentColor"
                strokeWidth={1.8}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 13.5h6v6.75h-6V13.5Zm0-9.75h6v6.75h-6V3.75Zm10.5 0h6v6.75h-6V3.75Zm0 9.75h6v6.75h-6V13.5Z"
                />
              </svg>
            </span>
            <span className="text-base font-semibold">Dashboard</span>
            <span className="text-xs text-emerald-50/80">Track leads by status</span>
          </Link>

          <Link
            href="/cron"
            className="group flex flex-col items-center gap-3 rounded-2xl border border-white/20 bg-white/10 p-6 text-white shadow-lg backdrop-blur transition hover:-translate-y-1 hover:bg-white/20 hover:shadow-2xl"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 transition group-hover:bg-white/25">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-7 w-7"
                stroke="currentColor"
                strokeWidth={1.8}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6.75v5.25l3 1.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                />
              </svg>
            </span>
            <span className="text-base font-semibold">Cron</span>
            <span className="text-xs text-emerald-50/80">Monitor reminder delivery</span>
          </Link>

          <Link
            href="/analytics"
            className="group flex flex-col items-center gap-3 rounded-2xl border border-white/20 bg-white/10 p-6 text-white shadow-lg backdrop-blur transition hover:-translate-y-1 hover:bg-white/20 hover:shadow-2xl"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 transition group-hover:bg-white/25">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-7 w-7"
                stroke="currentColor"
                strokeWidth={1.8}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 12a9 9 0 1 1-9-9v9h9Z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14 3.5A9 9 0 0 1 20.5 10H14V3.5Z"
                />
              </svg>
            </span>
            <span className="text-base font-semibold">Lead Analytics</span>
            <span className="text-xs text-emerald-50/80">See why leads are lost</span>
          </Link>

          {/* Future endpoint cards go here. */}
        </div>
      </div>
    </div>
  );
}
