'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import ChatList, { ChatListItem } from '@/components/dashboard/ChatList';
import ChatWindow from '@/components/dashboard/ChatWindow';

/**
 * Chat route — full-page messaging.
 *
 * Desktop: conversation list (left) + the selected chat window (right).
 * Mobile: a single column — the list shows until a chat is opened, then the
 * conversation takes over with a back button.
 *
 * Supports a `?phone=` deep-link (used by the admin dashboard "Open Chat"
 * action) to seed the selected conversation. useSearchParams requires a
 * <Suspense> boundary in Next 14 App-Router client pages.
 */
function ChatPageInner() {
  const searchParams = useSearchParams();
  const phoneParam = searchParams.get('phone');

  const [selectedPhone, setSelectedPhone] = useState<string | null>(phoneParam);
  const [chats, setChats] = useState<ChatListItem[]>([]);

  // Seed / update the selected thread when the ?phone= param changes.
  useEffect(() => {
    if (phoneParam) setSelectedPhone(phoneParam);
  }, [phoneParam]);

  const selected = chats.find((c) => c.phone === selectedPhone) ?? null;

  // Keep local chat state in sync when the toggle flips ai_mode.
  function handleAiModeChange(aiMode: boolean) {
    if (!selectedPhone) return;
    setChats((prev) =>
      prev.map((c) =>
        c.phone === selectedPhone
          ? { ...c, ai_mode: aiMode, needs_attention: c.last_message_direction === 'inbound' && !aiMode }
          : c,
      ),
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* List — full width on mobile, fixed share on desktop. Hidden on mobile
          once a conversation is open. */}
      <aside
        className={`w-full border-r border-gray-200 bg-white md:flex md:w-[34%] md:max-w-sm ${
          selectedPhone ? 'hidden' : 'flex'
        } flex-col`}
      >
        <ChatList selectedPhone={selectedPhone} onSelect={setSelectedPhone} onChatsLoaded={setChats} />
      </aside>

      {/* Conversation — hidden on mobile until a chat is picked. */}
      <section
        className={`min-w-0 flex-1 ${selectedPhone ? 'flex' : 'hidden md:flex'} flex-col`}
      >
        <ChatWindow
          phone={selectedPhone}
          fullName={selected?.full_name ?? null}
          aiMode={selected?.ai_mode ?? true}
          leadStatus={selected?.lead_status ?? null}
          leadReason={selected?.lead_reason ?? null}
          onAiModeChange={handleAiModeChange}
          onBack={() => setSelectedPhone(null)}
        />
      </section>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-gray-400">Loading…</div>}>
      <ChatPageInner />
    </Suspense>
  );
}
