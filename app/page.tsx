'use client';

import { Suspense, useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Home / login page.
 *
 * The middleware redirects unauthenticated visits of /whatsapp here (with a
 * ?next= param). This page posts the shared password to POST /api/auth/login,
 * which sets the signed session cookie, then forwards to the dashboard.
 */

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/home';

  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || 'Login failed');
      }
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-600 via-green-700 to-teal-800 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/20 bg-white p-8 shadow-2xl backdrop-blur">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-green-700 text-lg font-bold text-white shadow-md">
            BF
          </div>
          <h1 className="text-xl font-bold text-gray-900">BRIQ Foundation</h1>
          <p className="text-sm text-gray-500">CRM Dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300"
              placeholder="Enter dashboard password"
            />
          </div>

          {error && <div className="text-sm text-red-500">{error}</div>}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full rounded-lg bg-gradient-to-r from-emerald-600 to-green-700 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-emerald-700 hover:to-green-800 disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <a
          href="/home"
          className="mt-4 block text-center text-xs text-gray-400 hover:text-gray-600"
        >
          Go to dashboard →
        </a>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-100 text-gray-400">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
