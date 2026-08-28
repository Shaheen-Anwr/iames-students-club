'use client';

// App-wide "how many conversations have unread messages" signal.
//
// ChatProvider already tracks per-conversation unread counts, but it's only mounted inside
// /chat (and /feed). The nav bar and the installed-app icon badge need the number everywhere,
// so this is a deliberately tiny, read-only companion: seed once from /chat/conversations,
// then keep it live off the same socket 'newMessage' event ChatProvider listens to. When a
// client cache lands (roadmap item 2) the seed fetch dedupes with ChatProvider's.

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useSocket } from '@/lib/socket-context';
import type { Message } from '@/lib/types';

const ChatUnreadContext = createContext<number>(0);

export function ChatUnreadProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const pathname = usePathname();
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());

  // The conversation the user is currently reading -- new messages there aren't "unread".
  const activeId =
    pathname?.startsWith('/chat/') ? pathname.slice('/chat/'.length).split('/')[0] || null : null;
  const activeIdRef = useRef<string | null>(null);
  const userIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);
  useEffect(() => {
    userIdRef.current = user?._id;
  }, [user]);

  // Seed: which conversations currently carry unread messages.
  useEffect(() => {
    if (!user) {
      setUnreadIds(new Set());
      return;
    }
    let cancelled = false;
    api
      .get<{ _id: string; unreadCount?: number }[]>('/chat/conversations')
      .then((list) => {
        if (cancelled) return;
        setUnreadIds(new Set(list.filter((c) => (c.unreadCount ?? 0) > 0).map((c) => c._id)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Opening a conversation clears its dot immediately.
  useEffect(() => {
    if (!activeId) return;
    setUnreadIds((prev) => {
      if (!prev.has(activeId)) return prev;
      const next = new Set(prev);
      next.delete(activeId);
      return next;
    });
  }, [activeId]);

  // Live: a message from someone else, in a conversation you're not looking at, lights the dot.
  useEffect(() => {
    if (!socket) return;
    const onNewMessage = (message: Message) => {
      if (!message?.conversation) return;
      const fromMe = !!userIdRef.current && message.sender?._id === userIdRef.current;
      if (fromMe || message.conversation === activeIdRef.current) return;
      setUnreadIds((prev) =>
        prev.has(message.conversation) ? prev : new Set(prev).add(message.conversation),
      );
    };
    socket.on('newMessage', onNewMessage);
    return () => {
      socket.off('newMessage', onNewMessage);
    };
  }, [socket]);

  const count = unreadIds.size;

  // Mirror onto the installed-app icon badge where the platform supports it (installed PWA on
  // Chrome/Edge/Android, Safari on macOS). A no-op everywhere else.
  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (typeof nav.setAppBadge !== 'function') return;
    if (count > 0) nav.setAppBadge(count).catch(() => {});
    else nav.clearAppBadge?.().catch(() => {});
  }, [count]);

  return <ChatUnreadContext.Provider value={count}>{children}</ChatUnreadContext.Provider>;
}

export function useChatUnread() {
  return useContext(ChatUnreadContext);
}
