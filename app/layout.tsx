import type { Metadata } from 'next';
import './globals.css';
import ThemeManager from '@/components/ThemeManager';

/**
 * Root layout — imports global Tailwind styles and wraps all pages.
 */

export const metadata: Metadata = {
  title: 'Digital Tamizha — WhatsApp CRM',
  description: 'WhatsApp CRM dashboard for Digital Tamizha Real Estate.',
};

/**
 * Applies the saved theme (`localStorage.theme`) before the page paints, so the
 * site never flashes light-then-dark. Runs synchronously in <head>.
 */
const NO_FLASH_THEME_SCRIPT = `
try {
  if (localStorage.getItem('theme') === 'dark') {
    document.documentElement.classList.add('dark');
  }
} catch (e) {}
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body className="antialiased text-gray-900">
        <ThemeManager />
        {children}
      </body>
    </html>
  );
}
