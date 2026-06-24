'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LeadStatusBadge from './LeadStatusBadge';

/**
 * Left panel — customer (lead) conversation list.
 *
 * Polls GET /api/chats every ~5s. Shows full_name / phone / last_message /
 * last_message_at and a needs_attention badge. Has a search box that filters
 * client-side over name + phone + last message.
 *
 * Browser never talks to Supabase — all data comes from the API route.
 */

export interface ChatListItem {
  phone: string;
  full_name: string | null;
  ai_mode: boolean;
  conversation_status: string;
  lead_status: string;
  lead_reason: string | null;
  last_message: string | null;
  last_message_at: string | null;
  last_message_direction: string | null;
  needs_attention: boolean;
}

interface ChatListProps {
  selectedPhone: string | null;
  onSelect: (phone: string) => void;
  /** Notify parent of the freshest chats array (used by ChatTab stats etc). */
  onChatsLoaded?: (chats: ChatListItem[]) => void;
}

const POLL_MS = 5000;

// Deterministic avatar gradient from the phone string so each lead keeps a
// stable color across renders.
const AVATAR_GRADIENTS = [
  'from-emerald-400 to-green-600',
  'from-sky-400 to-blue-600',
  'from-violet-400 to-purple-600',
  'from-amber-400 to-orange-600',
  'from-rose-400 to-pink-600',
  'from-teal-400 to-cyan-600',
];

function avatarGradient(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { day: '2-digit', month: 'short' });
}

export default function ChatList({
  selectedPhone,
  onSelect,
  onChatsLoaded,
}: ChatListProps) {
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedCb = useRef(onChatsLoaded);
  loadedCb.current = onChatsLoaded;

  const fetchChats = useCallback(async () => {
    try {
      const res = await fetch('/api/chats', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }
      const data = (await res.json()) as ChatListItem[];
      setChats(Array.isArray(data) ? data : []);
      setError(null);
      loadedCb.current?.(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChats();
    const id = setInterval(fetchChats, POLL_MS);
    return () => clearInterval(id);
  }, [fetchChats]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((c) => {
      const name = (c.full_name ?? '').toLowerCase();
      const phone = c.phone.toLowerCase();
      const last = (c.last_message ?? '').toLowerCase();
      return name.includes(q) || phone.includes(q) || last.includes(q);
    });
  }, [chats, search]);

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Search */}
      <div className="border-b border-gray-100 p-3">
        <div className="relative">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.3-4.3M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leads…"
            className="w-full rounded-xl border border-transparent bg-gray-100 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-200"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading && chats.length === 0 ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex animate-pulse items-center gap-3">
                <div className="h-11 w-11 flex-shrink-0 rounded-full bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-2.5 w-2/3 rounded bg-gray-200" />
                  <div className="h-2 w-1/2 rounded bg-gray-100" />
                </div>
              </div>
            ))}
          </div>
        ) : error && chats.length === 0 ? (
          <div className="p-4 text-center text-sm text-red-500">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-300">
              <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth={1.6}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3.75h6m4.5 4.5-3 3v-3H6.75A2.25 2.25 0 0 1 4.5 14.25v-7.5A2.25 2.25 0 0 1 6.75 4.5h10.5A2.25 2.25 0 0 1 19.5 6.75v7.5A2.25 2.25 0 0 1 18 16.5Z" />
              </svg>
            </div>
            <span className="text-sm text-gray-400">
              {search ? 'No matching leads' : 'No conversations yet'}
            </span>
          </div>
        ) : (
          filtered.map((c) => {
            const active = c.phone === selectedPhone;
            return (
              <button
                key={c.phone}
                onClick={() => onSelect(c.phone)}
                className={`relative flex w-full items-center gap-3 border-b border-gray-50 px-3 py-3 text-left transition-colors ${
                  active ? 'bg-emerald-50/80' : 'hover:bg-gray-50'
                }`}
              >
                {active && (
                  <span className="absolute inset-y-0 left-0 w-1 rounded-r bg-emerald-500" />
                )}
                <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-semibold text-white shadow-sm ${avatarGradient(c.phone)}`}>
                  {(c.full_name ?? c.phone).slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-gray-900">
                      {c.full_name || c.phone}
                    </span>
                    <span className={`flex-shrink-0 text-[11px] ${c.needs_attention ? 'font-semibold text-emerald-600' : 'text-gray-400'}`}>
                      {formatTime(c.last_message_at)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-gray-500">
                      {c.last_message || 'No messages'}
                    </span>
                    {c.needs_attention && (
                      <span className="flex h-4 min-w-4 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
                        !
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <LeadStatusBadge
                      status={c.lead_status}
                      reason={c.lead_reason}
                    />
                    {c.lead_reason ? (
                      <span
                        className="truncate text-[10px] text-gray-400"
                        title={c.lead_reason}
                      >
                        {c.lead_reason}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-1.5">
                    {c.full_name ? (
                      <span className="truncate text-[10px] text-gray-400">{c.phone}</span>
                    ) : (
                      <span />
                    )}
                    {c.ai_mode ? (
                      <span className="flex flex-shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        AI Responding
                      </span>
                    ) : (
                      <span className="flex flex-shrink-0 items-center gap-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                        Human Responding
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
