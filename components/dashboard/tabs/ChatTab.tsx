'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Chat stats tab.
 *
 * - Total messages today (derived in the browser from a per-phone scan is
 *   expensive; instead we count per-customer message totals using the chat
 *   list plus each lead's history). To keep it cheap we compute:
 *     • total messages today: sum across all leads' histories created today
 *     • per-customer message count: total messages per phone
 *
 * Data is pulled via the existing API routes only (no direct Supabase).
 */

interface ChatItem {
  phone: string;
  full_name: string | null;
}

interface PerCustomer {
  phone: string;
  full_name: string | null;
  total: number;
  today: number;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export default function ChatTab() {
  const [rows, setRows] = useState<PerCustomer[]>([]);
  const [totalToday, setTotalToday] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const chatsRes = await fetch('/api/chats', { cache: 'no-store' });
      if (!chatsRes.ok) throw new Error(`Failed to load chats (${chatsRes.status})`);
      const chats = (await chatsRes.json()) as ChatItem[];

      const results = await Promise.all(
        chats.map(async (c) => {
          const r = await fetch(
            `/api/messages/${encodeURIComponent(c.phone)}`,
            { cache: 'no-store' },
          );
          if (!r.ok) {
            return { phone: c.phone, full_name: c.full_name, total: 0, today: 0 };
          }
          const data = (await r.json()) as {
            messages: { created_at: string }[];
          };
          const msgs = Array.isArray(data.messages) ? data.messages : [];
          const today = msgs.filter((m) => isToday(m.created_at)).length;
          return {
            phone: c.phone,
            full_name: c.full_name,
            total: msgs.length,
            today,
          };
        }),
      );

      results.sort((a, b) => b.total - a.total);
      setRows(results);
      setTotalToday(results.reduce((sum, r) => sum + r.today, 0));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="h-full overflow-y-auto p-6">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Chat Stats</h2>

      {loading ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : error ? (
        <div className="text-sm text-red-500">{error}</div>
      ) : (
        <>
          <div className="mb-6 inline-flex flex-col rounded-xl border border-gray-200 bg-white px-6 py-4 shadow-sm">
            <span className="text-3xl font-bold text-green-600">
              {totalToday}
            </span>
            <span className="text-xs text-gray-500">Total messages today</span>
          </div>

          <h3 className="mb-2 text-sm font-medium text-gray-700">
            Per-customer message count
          </h3>
          {rows.length === 0 ? (
            <div className="text-sm text-gray-400">No conversations yet</div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-2">Customer</th>
                    <th className="px-4 py-2">Phone</th>
                    <th className="px-4 py-2 text-right">Today</th>
                    <th className="px-4 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.phone} className="border-t border-gray-100">
                      <td className="px-4 py-2 text-gray-900">
                        {r.full_name || '—'}
                      </td>
                      <td className="px-4 py-2 text-gray-500">{r.phone}</td>
                      <td className="px-4 py-2 text-right text-gray-700">
                        {r.today}
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-gray-900">
                        {r.total}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
