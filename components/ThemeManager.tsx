'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Keeps the chosen theme applied on every route for the whole session.
 *
 * The no-FOUC script in app/layout.tsx applies the saved theme on the first
 * paint, and the `dark` class on <html> normally survives client-side
 * navigation. This component is belt-and-suspenders: on mount and on every
 * pathname change it re-reads `localStorage.theme` and re-asserts the class, so
 * the choice provably holds across EVERY page (/, /home, /whatsapp, /dashboard,
 * /cron, …) for the entire session — never resetting per route. It also mirrors
 * the choice across tabs via the `storage` event.
 *
 * Mounted once in the root layout (app/layout.tsx).
 */
export default function ThemeManager() {
  const pathname = usePathname();

  // Re-assert on first mount and on every route change.
  useEffect(() => {
    let dark = false;
    try {
      dark = localStorage.getItem('theme') === 'dark';
    } catch {
      /* localStorage unavailable (private mode) — leave current class as-is. */
    }
    document.documentElement.classList.toggle('dark', dark);
  }, [pathname]);

  // Keep other tabs in sync when the theme is flipped.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === 'theme') {
        document.documentElement.classList.toggle('dark', e.newValue === 'dark');
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return null;
}
