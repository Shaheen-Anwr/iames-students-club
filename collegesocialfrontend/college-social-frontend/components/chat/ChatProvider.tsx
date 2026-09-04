'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useSocket } from '@/lib/socket-context';
import type { Conversation, Message } from '@/lib/types';

interface ChatContextValue {
  conversations: Conversation[];
  loading: boolean;
  refresh: () => Promise<void>;
  findConversation: (id: string) => Conversation | undefined;
  addConversation: (conversation: Conversation) => void;
  typingConversationIds: Set<string>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

const TYPING_TIMEOUT_MS = 2500;

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { socket } = useSocket();
  const { user } = useAuth();
  const pathname = usePathname();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [typingConversationIds, setTypingConversationIds] = useState<Set<string>>(new Set());

  // The conversation the user is currently looking at (route: /chat/<id>). Messages that land
  // here must NOT raise the unread badge -- the user is reading them in real time.
  const activeConversationId =
    pathname?.startsWith('/chat/') ? pathname.slice('/chat/'.length).split('/')[0] || null : null;
  const activeIdRef = useRef<string | null>(null);
  const userIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    activeIdRef.current = activeConversationId;
  }, [activeConversationId]);
  useEffect(() => {
    userIdRef.current = user?._id;
  }, [user]);

  const refresh = useCallback(async () => {
    const data = await api.get<Conversation[]>('/chat/conversations');
    setConversations(data);
    setLoading(false);
  }, []);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Stale-closure-free view of the current list, for the socket listener below.
  const conversationsRef = useRef<Conversation[]>([]);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  // Keep the conversation list live as messages land while you're elsewhere in the app.
  // Deliberately narrow so the open ChatWindow is never disturbed (that was why the old
  // blanket `newMessage` -> refresh() listener was removed):
  //   - known conversation  -> bump its preview + move it to the top, locally.
  //   - unknown conversation -> a single refresh() to pull in the brand-new thread, so opening
  //     it from a notification doesn't dead-end on a spinner.
  useEffect(() => {
    if (!socket) return;
    let refreshing = false;

    const ensureKnown = (conversationId: string) => {
      if (conversationsRef.current.some((c) => c._id === conversationId) || refreshing) return;
      refreshing = true;
      refresh().finally(() => {
        refreshing = false;
      });
    };

    const bumpLocal = (conversationId: string, preview: string, at: string, incrementUnread: boolean) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c._id === conversationId);
        if (idx === -1) return prev;
        const next = [...prev];
        const [conv] = next.splice(idx, 1);
        next.unshift({
          ...conv,
          lastMessagePreview: preview || conv.lastMessagePreview,
          lastMessageAt: at,
          unreadCount: incrementUnread ? (conv.unreadCount ?? 0) + 1 : conv.unreadCount,
        });
        return next;
      });
    };

    const onNewMessage = (message: Message) => {
      if (!message?.conversation) return;
      ensureKnown(message.conversation);
      // WhatsApp-style: raise the unread badge only for messages from someone else that land
      // in a conversation the user isn't currently viewing.
      const fromMe = !!userIdRef.current && message.sender?._id === userIdRef.current;
      const isActive = message.conversation === activeIdRef.current;
      bumpLocal(
        message.conversation,
        message.text || '📎',
        message.createdAt ?? new Date().toISOString(),
        !fromMe && !isActive,
      );
    };

    const onNewNotification = (n: { type?: string; conversationId?: string | null }) => {
      if ((n?.type === 'chat_message' || n?.type === 'mention') && n.conversationId) {
        ensureKnown(n.conversationId);
      }
    };

    // A public group is created elsewhere -> it belongs in this user's list right away.
    const onConversationCreated = (conversation: Conversation) => {
      if (!conversation?._id) return;
      setConversations((prev) => (prev.some((c) => c._id === conversation._id) ? prev : [conversation, ...prev]));
    };

    // "Delete for everyone" may have just invalidated this conversation's cached list preview
    // (the server recomputes it when the deleted message was the last one) -- a targeted local
    // patch would need to guess whether it was the last message, so just re-pull the list, same
    // as the unknown-conversation path above.
    const onMessageDeleted = (payload: { message?: Message; forEveryone?: boolean }) => {
      if (!payload?.forEveryone || !payload.message?.conversation || refreshing) return;
      if (!conversationsRef.current.some((c) => c._id === payload.message!.conversation)) return;
      refreshing = true;
      refresh().finally(() => {
        refreshing = false;
      });
    };

    socket.on('newMessage', onNewMessage);
    socket.on('newNotification', onNewNotification);
    socket.on('conversationCreated', onConversationCreated);
    socket.on('messageDeleted', onMessageDeleted);
    return () => {
      socket.off('newMessage', onNewMessage);
      socket.off('newNotification', onNewNotification);
      socket.off('conversationCreated', onConversationCreated);
      socket.off('messageDeleted', onMessageDeleted);
    };
  }, [socket, refresh]);

  // Opening a conversation clears its unread badge immediately (the server-side markRead is
  // fired separately by ChatWindow over the socket). Re-runs when the list grows so a thread
  // opened straight from a notification still gets cleared once it loads in.
  useEffect(() => {
    if (!activeConversationId) return;
    setConversations((prev) => {
      const idx = prev.findIndex((c) => c._id === activeConversationId);
      if (idx === -1 || !(prev[idx].unreadCount ?? 0)) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], unreadCount: 0 };
      return next;
    });
  }, [activeConversationId, conversations.length]);

  // Presence updates – only updates online status, no full reload.
  useEffect(() => {
    if (!socket) return;
    const onPresenceUpdate = (payload: { userId: string; isOnline: boolean; lastSeenAt?: string }) => {
      setConversations((prev) =>
        prev.map((c) => ({
          ...c,
          participants: c.participants.map((p) =>
            p && p._id === payload.userId ? { ...p, isOnline: payload.isOnline, lastSeenAt: payload.lastSeenAt ?? p.lastSeenAt } : p,
          ),
        })),
      );
    };
    socket.on('presenceUpdate', onPresenceUpdate);
    return () => {
      socket.off('presenceUpdate', onPresenceUpdate);
    };
  }, [socket]);

  // Typing indicators – updates the list preview, no full reload.
  useEffect(() => {
    if (!socket) return;
    const timeouts = new Map<string, ReturnType<typeof setTimeout>>();

    const clear = (conversationId: string) => {
      setTypingConversationIds((prev) => {
        if (!prev.has(conversationId)) return prev;
        const next = new Set(prev);
        next.delete(conversationId);
        return next;
      });
    };

    const onTyping = (payload: { conversationId: string }) => {
      setTypingConversationIds((prev) => (prev.has(payload.conversationId) ? prev : new Set(prev).add(payload.conversationId)));
      const existing = timeouts.get(payload.conversationId);
      if (existing) clearTimeout(existing);
      timeouts.set(
        payload.conversationId,
        setTimeout(() => clear(payload.conversationId), TYPING_TIMEOUT_MS),
      );
    };
    const onStopTyping = (payload: { conversationId: string }) => {
      const existing = timeouts.get(payload.conversationId);
      if (existing) clearTimeout(existing);
      timeouts.delete(payload.conversationId);
      clear(payload.conversationId);
    };

    socket.on('userTyping', onTyping);
    socket.on('userStopTyping', onStopTyping);
    return () => {
      socket.off('userTyping', onTyping);
      socket.off('userStopTyping', onStopTyping);
      timeouts.forEach((t) => clearTimeout(t));
    };
  }, [socket]);

  const findConversation = useCallback((id: string) => conversations.find((c) => c._id === id), [conversations]);

  const addConversation = useCallback((conversation: Conversation) => {
    setConversations((prev) => (prev.some((c) => c._id === conversation._id) ? prev : [conversation, ...prev]));
  }, []);

  return (
    <ChatContext.Provider
      value={{ conversations, loading, refresh, findConversation, addConversation, typingConversationIds }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
}