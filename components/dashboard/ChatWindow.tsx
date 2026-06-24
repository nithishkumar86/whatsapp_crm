'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  FormEvent,
} from 'react';
import ReplyModeMenu from './ReplyModeMenu';
import LeadStatusBadge from './LeadStatusBadge';

/**
 * Right panel — conversation view for one phone.
 *
 * - Polls GET /api/messages/[phone] every ~5s.
 * - inbound bubbles align left, outbound align right (WhatsApp-style).
 * - Message input posts to POST /api/messages/send.
 * - Header carries the AI/Agent toggle.
 *
 * Message content is rendered as plain text (React escapes it) — no
 * dangerouslySetInnerHTML, so customer-supplied content cannot inject markup.
 */

interface Message {
  id: string;
  phone: string;
  wa_message_id: string | null;
  direction: 'inbound' | 'outbound' | string;
  content: string | null;
  message_type: string | null;
  sent_by: string | null;
  media_url: string | null;
  template_name: string | null;
  status: string | null;
  error_message: string | null;
  created_at: string;
}

interface ChatWindowProps {
  phone: string | null;
  fullName: string | null;
  aiMode: boolean;
  leadStatus: string | null;
  leadReason: string | null;
  onAiModeChange: (aiMode: boolean) => void;
  /** Mobile-only: go back to the conversation list. */
  onBack?: () => void;
}

const POLL_MS = 5000;

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;

/** True when a media message should render as an inline image preview. */
function isImageMessage(m: Message): boolean {
  if (m.message_type === 'image') return true;
  return Boolean(m.media_url && IMAGE_EXT.test(m.media_url.split('?')[0]));
}

/**
 * Human-friendly file name for a media message. Prefers the name embedded in
 * the "[brochure sent: NAME]" tag; otherwise derives it from the media URL,
 * stripping the "<timestamp>_<rand>_" upload prefix.
 */
function deriveFileName(m: Message): string {
  const tag = m.content?.match(/\[brochure sent:\s*([^\]]+)\]/i);
  if (tag) return tag[1].trim();
  if (m.media_url) {
    const last = m.media_url.split('?')[0].split('/').pop() || 'file';
    return decodeURIComponent(last.replace(/^\d+_[a-z0-9]+_/i, ''));
  }
  return m.message_type || 'file';
}

/**
 * Text to show in the bubble. Strips the internal "[brochure sent: …]" marker
 * (the file itself is rendered separately as a preview/card).
 */
function displayContent(m: Message): string {
  const raw = m.content || (m.template_name ? `[template: ${m.template_name}]` : '');
  return raw.replace(/\s*\[brochure sent:[^\]]*\]\s*/gi, ' ').trim();
}

export default function ChatWindow({
  phone,
  fullName,
  aiMode,
  leadStatus,
  leadReason,
  onAiModeChange,
  onBack,
}: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Tracks which conversation we've already auto-scrolled, and the last
  // message count, so polling refreshes don't keep dragging the view down.
  const loadedPhoneRef = useRef<string | null>(null);
  const prevCountRef = useRef(0);

  const fetchMessages = useCallback(async () => {
    if (!phone) return;
    try {
      const res = await fetch(`/api/messages/${encodeURIComponent(phone)}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as { messages: Message[] };
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [phone]);

  useEffect(() => {
    if (!phone) {
      setMessages([]);
      return;
    }
    setLoading(true);
    setMessages([]);
    fetchMessages();
    const id = setInterval(fetchMessages, POLL_MS);
    return () => clearInterval(id);
  }, [phone, fetchMessages]);

  // Auto-scroll policy:
  //  - When a conversation is first opened, jump straight to the latest message.
  //  - On later polls, only follow new messages if the user is already near the
  //    bottom. If they've scrolled up to read history, never yank them down.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const newConversation = loadedPhoneRef.current !== phone;
    const grew = messages.length > prevCountRef.current;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const nearBottom = distanceFromBottom < 120;

    if (newConversation) {
      // Wait for the first non-empty batch to render, then land at the bottom
      // instantly (no smooth animation on open).
      if (messages.length > 0) {
        bottomRef.current?.scrollIntoView({ behavior: 'auto' });
        loadedPhoneRef.current = phone;
      }
    } else if (grew && nearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }

    prevCountRef.current = messages.length;
  }, [messages, phone]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !phone || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, message: text }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || `Failed (${res.status})`);
      }
      setDraft('');
      await fetchMessages();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  if (!phone) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-gradient-to-b from-gray-50 to-gray-100 text-gray-400">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm">
          <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 text-emerald-400" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3.75h6m4.5 4.5-3 3v-3H6.75A2.25 2.25 0 0 1 4.5 14.25v-7.5A2.25 2.25 0 0 1 6.75 4.5h10.5A2.25 2.25 0 0 1 19.5 6.75v7.5A2.25 2.25 0 0 1 18 16.5Z" />
          </svg>
        </div>
        <span className="text-sm">Select a conversation to start</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#efeae2]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              aria-label="Back to conversations"
              className="-ml-1 rounded-lg p-1 text-gray-500 hover:bg-gray-100 md:hidden"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
          )}
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-green-600 text-sm font-semibold text-white shadow-sm">
            {(fullName ?? phone).slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">
                {fullName || phone}
              </span>
              <LeadStatusBadge status={leadStatus} reason={leadReason} />
            </div>
            <div className="text-xs text-gray-400">
              {phone}
              {leadReason ? (
                <span className="ml-1.5 text-gray-400">· {leadReason}</span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
        {loading && messages.length === 0 ? (
          <div className="text-center text-sm text-gray-400">Loading…</div>
        ) : error && messages.length === 0 ? (
          <div className="text-center text-sm text-red-500">{error}</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-sm text-gray-400">
            No messages yet
          </div>
        ) : (
          messages.map((m) => {
            const outbound = m.direction === 'outbound';
            return (
              <div
                key={m.id}
                className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] px-3 py-2 text-sm shadow-sm ${
                    outbound
                      ? 'rounded-2xl rounded-br-md bg-[#d9fdd3] text-[#111b21]'
                      : 'rounded-2xl rounded-bl-md bg-[#ffffff] text-[#111b21]'
                  }`}
                >
                  {m.media_url &&
                    (isImageMessage(m) ? (
                      <a
                        href={m.media_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mb-1.5 block"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={m.media_url}
                          alt={deriveFileName(m)}
                          loading="lazy"
                          className="max-h-60 w-auto max-w-full rounded-lg object-cover"
                        />
                        <span className="mt-1 block text-[11px] text-[#667781]">
                          {deriveFileName(m)}
                        </span>
                      </a>
                    ) : (
                      <a
                        href={m.media_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mb-1.5 flex items-center gap-2 rounded-lg bg-black/5 px-2.5 py-2 transition hover:bg-black/10"
                      >
                        <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7 flex-shrink-0 text-emerald-600" stroke="currentColor" strokeWidth={1.6}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                        </svg>
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-[#3b4a54]">
                          {deriveFileName(m)}
                        </span>
                        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 flex-shrink-0 text-[#8696a0]" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                      </a>
                    ))}
                  {displayContent(m) && (
                    <div className="whitespace-pre-wrap break-words">
                      {displayContent(m)}
                    </div>
                  )}
                  <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[#667781]">
                    {m.sent_by && outbound && (
                      <span className="uppercase">{m.sent_by}</span>
                    )}
                    <span>{formatTime(m.created_at)}</span>
                    {outbound && m.status === 'failed' && (
                      <span className="text-red-500">failed</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <form
        onSubmit={handleSend}
        className="border-t border-gray-200 bg-white p-3"
      >
        {sendError && (
          <div className="mb-2 text-xs text-red-500">{sendError}</div>
        )}
        <div className="flex items-center gap-2">
          <ReplyModeMenu
            phone={phone}
            aiMode={aiMode}
            onChange={onAiModeChange}
          />
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a message…"
            className="flex-1 rounded-full border border-transparent bg-gray-100 px-4 py-2.5 text-sm outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-200"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            aria-label="Send message"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-sm transition hover:from-emerald-600 hover:to-green-700 disabled:opacity-40"
          >
            {sending ? (
              <span className="text-sm">…</span>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.27 4.36a.6.6 0 0 1 .82-.74l16.5 7.83a.6.6 0 0 1 0 1.08l-16.5 7.84a.6.6 0 0 1-.82-.74L6 12Zm0 0h6" />
              </svg>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
