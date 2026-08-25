'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/api';
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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [typingConversationIds, setTypingConversationIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    const data = await api.get<Conversation[]>('/chat/conversations');
    setConversations(data);
    setLoading(false);
  }, []);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // 🔥 FIX: REMOVED the `newMessage` listener that called refresh().
  // This was the cause of the chat window reloading on every new message.
  // Now, the conversation list updates only on manual refresh or navigation.

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