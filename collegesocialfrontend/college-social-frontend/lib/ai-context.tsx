'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from './auth-context';
import type { AiConversation, Post } from '@/lib/types';

interface AiContextValue {
  conversations: AiConversation[];
  loading: boolean;
  refresh: () => Promise<void>;
  findConversation: (id: string) => AiConversation | undefined;
  addConversation: (conversation: AiConversation) => void;
  removeConversation: (id: string) => void;
  // Shared open/closed state for the AI panel -- lets a "Share with AI" action elsewhere in the
  // app (e.g. PostCard) pop the floating AiFab open, since AiFab used to own `open` purely as
  // local state with no way for another component to trigger it.
  panelOpen: boolean;
  setPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  // A post the student asked to discuss with the assistant -- picked up by whichever AiChatPanel
  // instance is actually mounted (the AiFab popover or the feed's embedded FeedAiChatCard).
  pendingShare: Post | null;
  shareToAi: (post: Post) => void;
  clearPendingShare: () => void;
}

const AiContext = createContext<AiContextValue | null>(null);

// Mounted globally (in Providers.tsx) since the floating AI button needs to be reachable from
// every authenticated route, not just /ai -- same reasoning as NotificationsProvider. Unlike
// ChatProvider/GroupsProvider (scoped, always mounted post-auth), this one guards on `user`
// itself since Providers.tsx sits outside AppShell's auth gate.
export function AiProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [pendingShare, setPendingShare] = useState<Post | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setConversations([]);
      setLoading(false);
      return;
    }
    const data = await api.get<AiConversation[]>('/ai/conversations');
    setConversations(data);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const findConversation = useCallback((id: string) => conversations.find((c) => c._id === id), [conversations]);

  const addConversation = useCallback((conversation: AiConversation) => {
    setConversations((prev) => (prev.some((c) => c._id === conversation._id) ? prev : [conversation, ...prev]));
  }, []);

  const removeConversation = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c._id !== id));
  }, []);

  const shareToAi = useCallback((post: Post) => {
    setPendingShare(post);
    setPanelOpen(true);
  }, []);

  const clearPendingShare = useCallback(() => setPendingShare(null), []);

  return (
    <AiContext.Provider
      value={{
        conversations,
        loading,
        refresh,
        findConversation,
        addConversation,
        removeConversation,
        panelOpen,
        setPanelOpen,
        pendingShare,
        shareToAi,
        clearPendingShare,
      }}
    >
      {children}
    </AiContext.Provider>
  );
}

export function useAi() {
  const ctx = useContext(AiContext);
  if (!ctx) throw new Error('useAi must be used within AiProvider');
  return ctx;
}
