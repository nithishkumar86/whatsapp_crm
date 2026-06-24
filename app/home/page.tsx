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
          DT
        </div>

        <h1 className="mb-2 text-3xl font-bold text-white sm:text-4xl">
          Welcome to BRIQ Foundation WhatsApp CRM
        </h1>
        <p className="mb-10 text-sm text-emerald-100/90">
          Manage leads, run the AI chatbot, and automate follow-ups — all in one place.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/whatsapp"
            className="group flex flex-col items-center gap-3 rounded-2xl border border-white/20 bg-white/10 p-6 text-white shadow-lg backdrop-blur transition hover:-translate-y-1 hover:bg-white/20 hover:shadow-2xl"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 transition group-hover:bg-white/25">
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-7 w-7"
                aria-hidden="true"
              >
                <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.02h-.01a8.23 8.23 0 0 1-4.19-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.37c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.25 8.24Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.79.98-.14.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.39.11-.51.11-.11.25-.29.37-.43.13-.14.17-.25.25-.41.08-.16.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.16 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.16 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28Z" />
              </svg>
            </span>
            <span className="text-base font-semibold">WhatsApp</span>
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
