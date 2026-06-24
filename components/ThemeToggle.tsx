'use client';

import { useEffect, useState } from 'react';

/**
 * Light / Dark theme switch.
 *
 * Toggles the `dark` class on <html> (which the global override layer in
 * globals.css keys off) and persists the choice to localStorage so every page
 * of the site honours it. The no-FOUC script in app/layout.tsx applies the
 * saved choice on the next load before paint.
 *
 * Rendered as a two-button segmented control. `mounted` guards the active
 * highlight so the server-rendered markup matches the first client render
 * (avoids a hydration mismatch).
 */

type Theme = 'light' | 'dark';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  }, []);

  function apply(next: Theme) {
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* localStorage unavailable (private mode) — theme still applies for this session. */
    }
  }

  const lightActive = mounted && theme === 'light';
  const darkActive = mounted && theme === 'dark';

  return (
    <div
      role="group"
      aria-label="Theme"
      className="inline-flex items-center gap-1 rounded-full border border-white/30 bg-white/10 p-1 backdrop-blur"
    >
      <button
        type="button"
        onClick={() => apply('light')}
        aria-pressed={lightActive}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
          lightActive
            ? 'bg-white/90 text-emerald-700 shadow'
            : 'text-white/90 hover:bg-white/15'
        }`}
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth={1.8}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 3v1.5m0 15V21m9-9h-1.5m-15 0H3m15.36 6.36-1.06-1.06M6.7 6.7 5.64 5.64m12.72 0-1.06 1.06M6.7 17.3l-1.06 1.06M16.5 12a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z"
          />
        </svg>
        Light
      </button>

      <button
        type="button"
        onClick={() => apply('dark')}
        aria-pressed={darkActive}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
          darkActive
            ? 'bg-gray-900 text-white shadow'
            : 'text-white/90 hover:bg-white/15'
        }`}
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth={1.8}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21.75 15.5A9.25 9.25 0 1 1 8.5 2.25a7.25 7.25 0 0 0 13.25 13.25Z"
          />
        </svg>
        Dark
      </button>
    </div>
  );
}
