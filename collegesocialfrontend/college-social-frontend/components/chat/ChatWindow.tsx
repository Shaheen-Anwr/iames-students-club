'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell,
  BellOff,
  Bookmark,
  CalendarClock,
  CheckSquare,
  Download,
  Flame,
  GraduationCap,
  Info,
  Loader2,
  MessageCircle,
  Mic,
  Palette,
  Phone,
  Search,
  ShieldOff,
  Sparkles,
  Video,
} from 'lucide-react';
import { RoleBadge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { LoadError } from '@/components/ui/LoadError';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import type { DropdownItem } from '@/components/ui/Dropdown';
import { api, ApiError } from '@/lib/api';
import { chatApi, MESSAGE_PAGE_SIZE } from '@/lib/chat-api';
import { useAuth } from '@/lib/auth-context';
import { useSocket } from '@/lib/socket-context';
import { useToast } from '@/lib/toast-context';
import { saveBlob } from '@/lib/download';
import { claimEffectPlay, playChatEffect } from '@/lib/chat-effects';
import { playChatSound } from '@/lib/chat-sounds';
import { buildChatRows } from '@/lib/chat-grouping';
import {
  canPinInConversation,
  conversationAvatarUser,
  conversationTitle,
  formatClock,
  formatFullDate,
  isMuted,
  messagePreview,
  otherParticipants,
  presenceLabel,
  canSeePresence,
  stripMentionTokens,
  tickStatus,
  translationTarget,
  typingLabel,
} from '@/lib/chat-helpers';
import { assetUrl, cn } from '@/lib/utils';
import { AnalyticsEvent, track } from '@/lib/analytics';
import { chatAccentVars, chatBackgroundStyle, useChatAccent, useChatBackground } from '@/lib/chat-background';
import type { Message, MessageEffect, PinnedMessage, ReplyPreview, ScheduledChatMessage, User } from '@/lib/types';
import { useChat } from './ChatProvider';
import { useCall } from './CallProvider';
import { MessageBubble, type TranslationState } from './MessageBubble';
import { MessageInput, type MessageInputHandle, type SendPayload } from './MessageInput';
import { DayDivider, UnreadDivider } from './DayDivider';
import { ForwardModal } from './ForwardModal';
import { GroupInfoPanel } from './GroupInfoPanel';
import { ChatBackgroundModal } from './ChatBackgroundModal';
import { ImagePreviewModal } from './ImagePreviewModal';
import { ChatEffects } from './ChatEffects';
import { AiSummaryModal } from './AiSummaryModal';
import { MessageActionsOverlay, type MessageActionKey, type OverlayTarget } from './MessageActionsOverlay';
import {
  CreatePollModal,
  MessageInfoModal,
  PollVotesModal,
  ReactionsModal,
  ScheduledMessagesModal,
} from './ChatModals';
import {
  CatchUpChip,
  ChatHeader,
  ChatSearchBar,
  DropOverlay,
  JumpButtons,
  PinnedBanner,
  SelectionBar,
  TypingBubble,
  TypingDots,
} from './ChatChrome';
import { ChatThreadActionsContext, ChatThreadInfoContext, type ChatThreadActions } from './ChatThreadContext';
import { MessageThreadModal } from './MessageThreadModal';
import { RemindMessageModal } from './RemindMessageModal';
import { GroupVoiceRoom } from './GroupVoiceRoom';

const SEND_TIMEOUT_MS = 12_000;
// Offer the AI "catch me up" chip when you open a chat with at least this many unread messages.
const CATCH_UP_THRESHOLD = 8;
// Read heads get noisy (and costly) in huge public groups -- skip them past this size.
const READ_HEADS_MAX_PARTICIPANTS = 60;

const isPlaceholderId = (id: string) => id.startsWith('tmp_');

function byCreatedAt(a: Message, b: Message) {
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

// Same message content? -- how an optimistic placeholder is matched to its server echo.
function sameContent(a: Message, b: Message) {
  return (
    (a.text ?? '') === (b.text ?? '') &&
    (a.attachments?.length ?? 0) === (b.attachments?.length ?? 0) &&
    (a.poll?.question ?? null) === (b.poll?.question ?? null)
  );
}

// Older page(s) in front of what's loaded, de-duplicated by id.
function prependOlder(older: Message[], current: Message[]): Message[] {
  const known = new Set(current.map((m) => m._id));
  const fresh = older.filter((m) => !known.has(m._id));
  return fresh.length ? [...fresh, ...current] : current;
}

// Reconnect catch-up: fold a freshly fetched page into the thread (updates + new arrivals), and
// drop any optimistic placeholder whose real message turned up in it.
function mergeLatest(current: Message[], latest: Message[], myId: string): Message[] {
  const byId = new Map(current.filter((m) => !m.pending && !m.failed).map((m) => [m._id, m]));
  for (const m of latest) byId.set(m._id, m);
  const settled = [...byId.values()].sort(byCreatedAt);
  const placeholders = current.filter(
    (p) => (p.pending || p.failed) && !settled.some((m) => m.sender?._id === myId && sameContent(m, p)),
  );
  return [...settled, ...placeholders];
}

function toReplyPreview(m: Message): ReplyPreview {
  return {
    _id: m._id,
    text: m.text,
    sender: m.sender ? { _id: m.sender._id, name: m.sender.name } : null,
    attachments: m.attachments,
    deletedForEveryone: m.deletedForEveryone,
    poll: m.poll ? { question: m.poll.question } : null,
  };
}

export function ChatWindow({ conversationId }: { conversationId: string }) {
  const { user, updateLocalUser } = useAuth();
  const { socket } = useSocket();
  const { findConversation, refresh, messageCache } = useChat();
  const { startCall } = useCall();
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversation = findConversation(conversationId);
  const userId = user?._id ?? '';

  // ---------------------------------------------------------------------------------------------
  // State

  // A thread seen earlier this session (or warmed by the chat list) opens straight onto its last
  // page from memory; the effect below refreshes it in the background.
  const [cached] = useState(() => messageCache.get(conversationId));
  const [messages, setMessages] = useState<Message[]>(() => cached?.messages ?? []);
  const [loading, setLoading] = useState(!cached);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [hasMore, setHasMore] = useState(cached?.hasMore ?? false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const [typingIds, setTypingIds] = useState<string[]>([]);
  const [recordingIds, setRecordingIds] = useState<string[]>([]);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [forwardTargets, setForwardTargets] = useState<Message[] | null>(null);

  const [overlay, setOverlay] = useState<OverlayTarget | null>(null);
  const [selection, setSelection] = useState<string[] | null>(null);
  const [deleteSelectionOpen, setDeleteSelectionOpen] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [searchIndex, setSearchIndex] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);

  const [highlight, setHighlight] = useState<{ id: string; key: number } | null>(null);
  const [translations, setTranslations] = useState<Record<string, TranslationState>>({});

  const [pins, setPins] = useState<PinnedMessage[]>([]);
  const [pinIndex, setPinIndex] = useState(0);
  const [scheduled, setScheduled] = useState<ScheduledChatMessage[]>([]);
  const [scheduledLoading, setScheduledLoading] = useState(false);
  const [scheduledOpen, setScheduledOpen] = useState(false);

  const [infoOpen, setInfoOpen] = useState(false);
  const [backgroundModalOpen, setBackgroundModalOpen] = useState(false);
  const [pollModalOpen, setPollModalOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [catchUpDismissed, setCatchUpDismissed] = useState(false);
  const [messageInfoTarget, setMessageInfoTarget] = useState<Message | null>(null);
  const [reactionsTarget, setReactionsTarget] = useState<Message | null>(null);
  const [pollVotesTarget, setPollVotesTarget] = useState<Message | null>(null);
  // A message's side discussion (group chats), a "remind me" target, رافد composing an answer, and
  // the header's voice-room button (a counter: each press asks GroupVoiceRoom to join).
  const [threadTarget, setThreadTarget] = useState<Message | null>(null);
  const [remindTarget, setRemindTarget] = useState<Message | null>(null);
  const [rafedTyping, setRafedTyping] = useState(false);
  const [voiceJoinSignal, setVoiceJoinSignal] = useState(0);
  const [imagePreview, setImagePreview] = useState<{ message: Message; index: number } | null>(null);

  const [atBottom, setAtBottom] = useState(true);
  const [showJump, setShowJump] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);

  const { background, setBackground } = useChatBackground(conversationId);
  const { accent, setAccent } = useChatAccent(conversationId);

  // ---------------------------------------------------------------------------------------------
  // Refs (latest values for socket handlers / async flows)

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const unreadDividerRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<MessageInputHandle>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const messagesRef = useRef<Message[]>(messages);
  messagesRef.current = messages;
  const atBottomRef = useRef(true);
  const hasMoreRef = useRef(false);
  hasMoreRef.current = hasMore;
  const loadingOlderRef = useRef(false);
  const pendingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const typingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const recordingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const recordingPing = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingEmit = useRef<{ last: number; stop: ReturnType<typeof setTimeout> | null }>({ last: 0, stop: null });
  const scrollRestore = useRef<{ height: number; top: number } | null>(null);
  const pendingJump = useRef<string | null>(null);
  const didInitialScroll = useRef(false);
  const prevLastId = useRef<string | null>(null);
  const pendingRead = useRef(false);
  const dragDepth = useRef(0);
  // Messages newer than this arrived while the thread was open -- they get the entrance animation.
  const openedAt = useRef(Date.now());
  // Server id -> the optimistic placeholder id it replaced, so a sent message keeps its row key
  // (and its entrance animation runs to the end instead of the row remounting mid-spring).
  const sentRowKeys = useRef(new Map<string, string>());
  // Unread count captured the first time this conversation renders, before ChatProvider zeroes it.
  const unreadAtOpenRef = useRef<{ captured: boolean; count: number }>({ captured: false, count: 0 });

  if (conversation && !unreadAtOpenRef.current.captured) {
    unreadAtOpenRef.current = { captured: true, count: conversation.unreadCount ?? 0 };
  }

  // ---------------------------------------------------------------------------------------------
  // Loading

  // Latest page: shown as-is on a cold open; folded into the cached page (edits, deletions,
  // anything that arrived meanwhile) when one is already on screen -- no spinner either way.
  // Shares the request with a hover/touch preload that's still in flight.
  const loadedOnce = useRef(false);
  useEffect(() => {
    let cancelled = false;
    const showingCached = messagesRef.current.length > 0;
    if (!showingCached) setLoading(true);
    setLoadError(false);
    messageCache
      .refresh(conversationId)
      .then((data) => {
        if (cancelled) return;
        loadedOnce.current = true;
        setMessages((prev) => (prev.length ? mergeLatest(prev, data.messages, userId) : data.messages));
        setHasMore((prev) => (showingCached ? prev || data.hasMore : data.hasMore));
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        if (!showingCached) setLoadError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, reloadKey, messageCache]);

  // Leaving the chat hands its current page back to the cache, so reopening it is instant too.
  useEffect(
    () => () => {
      if (loadedOnce.current) messageCache.set(conversationId, { messages: messagesRef.current, hasMore: hasMoreRef.current });
    },
    [conversationId, messageCache],
  );

  const refreshPins = useCallback(async () => {
    try {
      setPins(await chatApi.pins(conversationId));
    } catch {
      /* banner is optional */
    }
  }, [conversationId]);

  const refreshScheduled = useCallback(async () => {
    setScheduledLoading(true);
    try {
      setScheduled(await chatApi.scheduled(conversationId));
    } catch {
      /* chip is optional */
    } finally {
      setScheduledLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    void refreshPins();
    void refreshScheduled();
  }, [refreshPins, refreshScheduled]);

  // Landed on a conversation that isn't in the cached list yet (a brand-new thread opened straight
  // from a notification)? Pull the list once so the header and participants resolve.
  const refreshedForMissing = useRef(false);
  useEffect(() => {
    if (!loading && !conversation && !refreshedForMissing.current) {
      refreshedForMissing.current = true;
      void refresh();
    }
  }, [loading, conversation, refresh]);

  // Don't leave optimistic-send fail-timers or typing timers running after leaving.
  useEffect(() => {
    const sendTimers = pendingTimers.current;
    const typers = typingTimers.current;
    const recorders = recordingTimers.current;
    const typingState = typingEmit.current;
    return () => {
      sendTimers.forEach((t) => clearTimeout(t));
      sendTimers.clear();
      typers.forEach((t) => clearTimeout(t));
      typers.clear();
      recorders.forEach((t) => clearTimeout(t));
      recorders.clear();
      if (typingState.stop) clearTimeout(typingState.stop);
      if (recordingPing.current) clearInterval(recordingPing.current);
    };
  }, []);

  // While recording a voice note, tell the others ("يسجل رسالة صوتية…"), refreshing every 4s so
  // the indicator expires by itself if this tab vanishes mid-recording.
  const handleRecordingChange = useCallback(
    (active: boolean) => {
      if (recordingPing.current) clearInterval(recordingPing.current);
      recordingPing.current = null;
      if (!socket) return;
      socket.emit('recordingVoice', { conversationId, active });
      if (active) {
        recordingPing.current = setInterval(() => socket.emit('recordingVoice', { conversationId, active: true }), 4000);
      }
    },
    [socket, conversationId],
  );

  const loadOlder = useCallback(async () => {
    const oldest = messagesRef.current.find((m) => !isPlaceholderId(m._id));
    if (!oldest || loadingOlderRef.current || !hasMoreRef.current) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const older = await chatApi.older(conversationId, oldest._id);
      const el = scrollRef.current;
      if (el) scrollRestore.current = { height: el.scrollHeight, top: el.scrollTop };
      setMessages((prev) => prependOlder(older.slice().reverse(), prev));
      setHasMore(older.length >= MESSAGE_PAGE_SIZE);
    } catch {
      /* the user can scroll up again to retry */
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [conversationId]);

  // ---------------------------------------------------------------------------------------------
  // Read receipts only while the tab is actually visible (a backgrounded tab mustn't "read").

  const markRead = useCallback(() => {
    if (!socket) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      pendingRead.current = true;
      return;
    }
    pendingRead.current = false;
    socket.emit('markRead', conversationId);
  }, [socket, conversationId]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && pendingRead.current) markRead();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [markRead]);

  // ---------------------------------------------------------------------------------------------
  // Socket

  const clearPendingTimer = (id: string) => {
    const t = pendingTimers.current.get(id);
    if (t) clearTimeout(t);
    pendingTimers.current.delete(id);
  };

  useEffect(() => {
    if (!socket || !userId) return;
    const join = () => {
      socket.emit('joinConversation', conversationId);
      socket.emit('markDelivered', conversationId);
      markRead();
    };
    join();

    const removeTyping = (id: string) => {
      const t = typingTimers.current.get(id);
      if (t) clearTimeout(t);
      typingTimers.current.delete(id);
      setTypingIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev));
    };
    const addTyping = (id: string) => {
      setTypingIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      const t = typingTimers.current.get(id);
      if (t) clearTimeout(t);
      typingTimers.current.set(id, setTimeout(() => removeTyping(id), 4000));
    };

    // Reconnected after a drop: re-join and fold in anything missed meanwhile.
    const onConnect = () => {
      join();
      chatApi
        .latest(conversationId)
        .then((data) => setMessages((prev) => mergeLatest(prev, data.slice().reverse(), userId)))
        .catch(() => undefined);
    };

    const onNewMessage = (message: Message) => {
      if (!message || message.conversation !== conversationId) return;
      // Thread replies live in their discussion panel (the root's chip updates via threadUpdated).
      if (message.threadRoot) return;
      if (message.bot === 'rafed') setRafedTyping(false);
      const mine = message.sender?._id === userId;
      setMessages((prev) => {
        if (prev.some((m) => m._id === message._id)) return prev;
        let next = prev;
        if (mine) {
          // Swap the matching optimistic placeholder for the real, server-issued message.
          let dropped = false;
          next = prev.filter((m) => {
            if (dropped || !m.pending || !sameContent(m, message)) return true;
            dropped = true;
            clearPendingTimer(m._id);
            sentRowKeys.current.set(message._id, m._id);
            return false;
          });
        }
        return [...next, message];
      });
      if (mine) {
        // Already celebrated locally at send time -- don't replay it for the echo.
        if (message.effect) claimEffectPlay(message._id);
        return;
      }
      if (message.sender?._id) removeTyping(message.sender._id);
      socket.emit('markDelivered', conversationId);
      markRead();
      if (message.effect && claimEffectPlay(message._id)) playChatEffect(message.effect);
      if (message.mentions?.includes(userId) && !atBottomRef.current) {
        setMentionIds((ids) => (ids.includes(message._id) ? ids : [...ids, message._id]));
      }
    };

    const replaceMessage = (message: Message) => {
      if (!message || message.conversation !== conversationId) return;
      setMessages((prev) => prev.map((m) => (m._id === message._id ? message : m)));
    };

    const onMessageDeleted = (payload: { message?: Message; forEveryone?: boolean }) => {
      const message = payload?.message;
      if (!message || message.conversation !== conversationId) return;
      if (payload.forEveryone) {
        replaceMessage(message);
        setPins((prev) => prev.filter((p) => p.message._id !== message._id));
      } else {
        setMessages((prev) => prev.filter((m) => m._id !== message._id));
      }
    };

    const onMessagesRead = (payload: { conversationId: string; userId: string; messageIds: string[] }) => {
      if (!payload || payload.conversationId !== conversationId) return;
      const ids = new Set(payload.messageIds);
      setMessages((prev) =>
        prev.map((m) =>
          ids.has(m._id) && !m.readBy?.includes(payload.userId)
            ? {
                ...m,
                readBy: [...(m.readBy ?? []), payload.userId],
                deliveredTo: [...new Set([...(m.deliveredTo ?? []), payload.userId])],
              }
            : m,
        ),
      );
    };

    const onMessagesDelivered = (payload: { conversationId: string; userId: string; messageIds: string[] }) => {
      if (!payload || payload.conversationId !== conversationId) return;
      const ids = new Set(payload.messageIds);
      setMessages((prev) =>
        prev.map((m) =>
          ids.has(m._id) && !m.deliveredTo?.includes(payload.userId)
            ? { ...m, deliveredTo: [...(m.deliveredTo ?? []), payload.userId] }
            : m,
        ),
      );
    };

    const onTyping = (payload: { conversationId: string; userId: string }) => {
      if (!payload || payload.conversationId !== conversationId || payload.userId === userId) return;
      addTyping(payload.userId);
    };
    const onStopTyping = (payload: { conversationId: string; userId: string }) => {
      if (!payload || payload.conversationId !== conversationId || payload.userId === userId) return;
      removeTyping(payload.userId);
    };

    // "يسجل رسالة صوتية…" -- refreshed every few seconds by the recorder, so it expires on its own.
    const onRecording = (payload: { conversationId: string; userId: string; active: boolean }) => {
      if (!payload || payload.conversationId !== conversationId || payload.userId === userId) return;
      const id = payload.userId;
      const existing = recordingTimers.current.get(id);
      if (existing) clearTimeout(existing);
      if (!payload.active) {
        recordingTimers.current.delete(id);
        setRecordingIds((prev) => prev.filter((x) => x !== id));
        return;
      }
      removeTyping(id);
      setRecordingIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      recordingTimers.current.set(
        id,
        setTimeout(() => {
          recordingTimers.current.delete(id);
          setRecordingIds((prev) => prev.filter((x) => x !== id));
        }, 7000),
      );
    };

    const onPinsUpdated = (payload: { conversationId: string; pins: PinnedMessage[]; actorId: string; pinned: boolean }) => {
      if (!payload || payload.conversationId !== conversationId || !Array.isArray(payload.pins)) return;
      setPins(payload.pins);
      setPinIndex(0);
      if (payload.actorId === userId) showToast(payload.pinned ? 'تم تثبيت الرسالة.' : 'تم إلغاء التثبيت.');
    };

    const onScheduledUpdated = (payload: { conversation?: string; status?: string; error?: string | null }) => {
      if (payload?.conversation !== conversationId) return;
      void refreshScheduled();
      if (payload.status === 'failed') showToast(payload.error || 'تعذّر إرسال رسالة مجدولة.', 'error');
    };

    const onThreadUpdated = (payload: {
      conversationId: string;
      rootId: string;
      threadCount: number;
      threadLastAt: string | null;
      threadParticipants: Message['threadParticipants'];
    }) => {
      if (payload?.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m._id === payload.rootId
            ? { ...m, threadCount: payload.threadCount, threadLastAt: payload.threadLastAt, threadParticipants: payload.threadParticipants }
            : m,
        ),
      );
    };

    const onRafedTyping = (payload: { conversationId: string; active: boolean }) => {
      if (payload?.conversationId === conversationId) setRafedTyping(!!payload.active);
    };

    socket.on('connect', onConnect);
    socket.on('newMessage', onNewMessage);
    socket.on('threadUpdated', onThreadUpdated);
    socket.on('rafedTyping', onRafedTyping);
    socket.on('messageEdited', replaceMessage);
    socket.on('messageReacted', replaceMessage);
    socket.on('messageUpdated', replaceMessage);
    socket.on('messageDeleted', onMessageDeleted);
    socket.on('messagesRead', onMessagesRead);
    socket.on('messagesDelivered', onMessagesDelivered);
    socket.on('userTyping', onTyping);
    socket.on('userStopTyping', onStopTyping);
    socket.on('userRecording', onRecording);
    socket.on('pinsUpdated', onPinsUpdated);
    socket.on('scheduledUpdated', onScheduledUpdated);
    return () => {
      socket.off('connect', onConnect);
      socket.off('newMessage', onNewMessage);
      socket.off('threadUpdated', onThreadUpdated);
      socket.off('rafedTyping', onRafedTyping);
      socket.off('messageEdited', replaceMessage);
      socket.off('messageReacted', replaceMessage);
      socket.off('messageUpdated', replaceMessage);
      socket.off('messageDeleted', onMessageDeleted);
      socket.off('messagesRead', onMessagesRead);
      socket.off('messagesDelivered', onMessagesDelivered);
      socket.off('userTyping', onTyping);
      socket.off('userStopTyping', onStopTyping);
      socket.off('userRecording', onRecording);
      socket.off('pinsUpdated', onPinsUpdated);
      socket.off('scheduledUpdated', onScheduledUpdated);
    };
  }, [socket, conversationId, userId, markRead, refreshScheduled, showToast]);

  // ---------------------------------------------------------------------------------------------
  // Scrolling

  // Re-derive "pinned to the bottom" from the DOM after a programmatic scroll -- scroll events for
  // it arrive later, and the stick-to-bottom observer must not act on a stale value meanwhile.
  const syncBottomState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    atBottomRef.current = bottom;
    setAtBottom(bottom);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
    atBottomRef.current = true;
    setAtBottom(true);
    setNewCount(0);
    setMentionIds([]);
  }, []);

  const scrollToMessage = useCallback(
    (id: string, behavior: ScrollBehavior = 'smooth') => {
      const el = messageRefs.current[id];
      if (!el) return false;
      el.scrollIntoView({ behavior, block: 'center' });
      if (behavior === 'auto') syncBottomState();
      else atBottomRef.current = false; // leaving the bottom; scroll events settle the real value
      setHighlight({ id, key: Date.now() });
      return true;
    },
    [syncBottomState],
  );

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const bottom = distance < 120;
    if (bottom !== atBottomRef.current) {
      atBottomRef.current = bottom;
      setAtBottom(bottom);
    }
    setShowJump(distance > 360);
    if (bottom) {
      setNewCount(0);
      setMentionIds((ids) => (ids.length ? [] : ids));
    }
    if (el.scrollTop < 320) void loadOlder();
  };

  // While pinned to the bottom, stay pinned when content grows underneath (images decoding,
  // link previews, a reaction row appearing) -- otherwise the newest message slides out of view.
  useEffect(() => {
    const content = contentRef.current;
    const el = scrollRef.current;
    if (!content || !el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (atBottomRef.current && !scrollRestore.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [loading]);

  // ---------------------------------------------------------------------------------------------
  // Derived thread data

  const unreadCountAtOpen = unreadAtOpenRef.current.count;
  const firstUnreadId = useMemo(() => {
    const count = unreadCountAtOpen;
    if (!count) return null;
    let seen = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender?._id === userId) continue;
      if (++seen === count) return messages[i]._id;
    }
    return messages.find((m) => m.sender?._id !== userId)?._id ?? null;
    // Anchored to the count captured at open; recomputed as history pages in.
  }, [messages, userId, unreadCountAtOpen]);

  const chatRows = useMemo(
    () => buildChatRows(messages, userId, !!conversation?.isGroup, firstUnreadId),
    [messages, userId, conversation?.isGroup, firstUnreadId],
  );

  const participants = conversation?.participants;
  const participantsById = useMemo(() => {
    const map = new Map<string, User>();
    (participants ?? []).forEach((p) => p && map.set(p._id, p));
    if (user) map.set(user._id, user);
    return map;
  }, [participants, user]);

  // Messenger-style read heads: each other participant's avatar sits under the newest message
  // they've read -- unless they've posted since (that already implies they read everything).
  const readHeads = useMemo(() => {
    const map = new Map<string, string>();
    if (!conversation || !userId) return map;
    const others = otherParticipants(conversation, userId);
    if (!others.length || others.length > READ_HEADS_MAX_PARTICIPANTS) return map;
    const byMessage = new Map<string, string[]>();
    for (const p of others) {
      let lastRead = -1;
      let lastOwn = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.pending || m.failed || m.deletedForEveryone) continue;
        if (m.sender?._id === p._id) {
          if (lastOwn === -1) lastOwn = i;
        } else if (lastRead === -1 && m.readBy?.includes(p._id)) {
          lastRead = i;
        }
        if (lastRead !== -1 && lastOwn !== -1) break;
      }
      if (lastRead !== -1 && lastRead > lastOwn) {
        const id = messages[lastRead]._id;
        byMessage.set(id, [...(byMessage.get(id) ?? []), p._id]);
      }
    }
    byMessage.forEach((ids, id) => map.set(id, ids.join(',')));
    return map;
  }, [messages, conversation, userId]);

  const pinnedIds = useMemo(() => new Set(pins.map((p) => p.message._id)), [pins]);
  const selectedSet = useMemo(() => new Set(selection ?? []), [selection]);
  const selectedMessages = useMemo(
    () => (selection ? messages.filter((m) => selectedSet.has(m._id)) : []),
    [messages, selection, selectedSet],
  );
  const activeSearchTerm = searchOpen && searchQuery.trim().length > 0 ? searchQuery.trim() : undefined;

  // ---------------------------------------------------------------------------------------------
  // Jumping (search hits, pins, replies, deep links, dates)

  const jumpToMessage = useCallback(
    async (id: string, createdAt?: string) => {
      if (scrollToMessage(id)) return;
      const oldest = messagesRef.current.find((m) => !isPlaceholderId(m._id));
      try {
        let older: Message[] = [];
        let exhausted = false;
        if (createdAt) {
          older = await chatApi.since(conversationId, createdAt, oldest?._id);
        } else {
          // Reply quotes carry no timestamp: walk back page by page (bounded).
          let cursor = oldest?._id;
          for (let i = 0; i < 12 && cursor; i++) {
            const page = await chatApi.older(conversationId, cursor);
            older.push(...page);
            if (page.some((m) => m._id === id)) break;
            if (page.length < MESSAGE_PAGE_SIZE) {
              exhausted = true;
              break;
            }
            cursor = page[page.length - 1]._id;
          }
        }
        if (!older.some((m) => m._id === id)) {
          showToast('تعذّر العثور على الرسالة — ربما حُذفت.', 'error');
          return;
        }
        pendingJump.current = id;
        if (exhausted) setHasMore(false);
        setMessages((prev) => prependOlder(older.slice().reverse(), prev));
      } catch {
        showToast('تعذّر الانتقال إلى الرسالة.', 'error');
      }
    },
    [conversationId, scrollToMessage, showToast],
  );

  const jumpToDate = useCallback(
    async (value: string) => {
      if (!value) return;
      const start = new Date(`${value}T00:00:00`);
      if (Number.isNaN(start.getTime())) return;
      const loaded = messagesRef.current.filter((m) => !isPlaceholderId(m._id));
      const oldest = loaded[0];
      if (oldest && new Date(oldest.createdAt) <= start) {
        const target = loaded.find((m) => new Date(m.createdAt) >= start);
        if (target) scrollToMessage(target._id);
        else showToast('لا توجد رسائل بعد هذا التاريخ.');
        return;
      }
      try {
        const older = await chatApi.since(conversationId, start.toISOString(), oldest?._id);
        const target = older[older.length - 1] ?? oldest;
        if (!target) {
          showToast('لا توجد رسائل في هذا التاريخ.');
          return;
        }
        if (!older.length) {
          scrollToMessage(target._id);
          return;
        }
        pendingJump.current = target._id;
        setMessages((prev) => prependOlder(older.slice().reverse(), prev));
      } catch {
        showToast('تعذّر الانتقال إلى التاريخ.', 'error');
      }
    },
    [conversationId, scrollToMessage, showToast],
  );

  // Layout pass after every thread change: restore position after prepending history, perform a
  // pending jump, place the initial view, and follow (or count) new arrivals at the bottom.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && scrollRestore.current) {
      el.scrollTop = el.scrollHeight - scrollRestore.current.height + scrollRestore.current.top;
      scrollRestore.current = null;
    }
    if (loading) return;

    if (pendingJump.current) {
      const id = pendingJump.current;
      pendingJump.current = null;
      scrollToMessage(id, 'auto');
    }

    const last = messages[messages.length - 1];
    const previousLast = prevLastId.current;
    prevLastId.current = last?._id ?? null;

    if (!didInitialScroll.current) {
      didInitialScroll.current = true;
      const target = searchParams?.get('m');
      if (target) {
        void jumpToMessage(target, searchParams?.get('t') ?? undefined);
        router.replace(`/chat/${conversationId}`, { scroll: false });
        return;
      }
      if (unreadDividerRef.current && unreadAtOpenRef.current.count >= 4) {
        // Open at the first unread message (WhatsApp-style) rather than the very bottom.
        unreadDividerRef.current.scrollIntoView({ block: 'start' });
        if (el) el.scrollTop = Math.max(0, el.scrollTop - 12);
        syncBottomState();
        return;
      }
      bottomRef.current?.scrollIntoView({ block: 'end' });
      return;
    }

    if (!last || last._id === previousLast) return;
    const previousIndex = previousLast ? messages.findIndex((m) => m._id === previousLast) : -1;
    const added = previousIndex === -1 ? 1 : messages.length - 1 - previousIndex;
    if (added <= 0) return;
    const lastFromMe = last.sender?._id === userId;
    if (lastFromMe || atBottomRef.current) scrollToBottom('smooth');
    else setNewCount((n) => n + added);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, loading]);

  // A deep link (?m=<id>&t=<iso>) while this chat is already open -- e.g. a search hit from the list.
  const deepLink = searchParams?.get('m');
  useEffect(() => {
    if (!deepLink || !didInitialScroll.current || loading) return;
    void jumpToMessage(deepLink, searchParams?.get('t') ?? undefined);
    router.replace(`/chat/${conversationId}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLink]);

  // ?thread=<rootId> (a thread-reply notification): open that discussion once the chat has loaded.
  const threadLink = searchParams?.get('thread');
  useEffect(() => {
    if (!threadLink || loading) return;
    const local = messages.find((m) => m._id === threadLink);
    if (local) setThreadTarget(local);
    else
      chatApi
        .thread(threadLink)
        .then((r) => setThreadTarget(r.root))
        .catch(() => showToast('تعذّر فتح النقاش.', 'error'));
    router.replace(`/chat/${conversationId}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadLink, loading]);

  // Keep رافد's "typing" bubble in view while it answers.
  useEffect(() => {
    if (rafedTyping && atBottomRef.current) scrollToBottom('smooth');
  }, [rafedTyping, scrollToBottom]);

  // Keep the typing bubble in view when it appears while you're at the bottom.
  useEffect(() => {
    if (typingIds.length && atBottomRef.current) scrollToBottom('smooth');
  }, [typingIds.length, scrollToBottom]);

  // ---------------------------------------------------------------------------------------------
  // In-conversation search

  useEffect(() => {
    const q = searchQuery.trim();
    if (!searchOpen || !q) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const results = await chatApi.searchIn(conversationId, q);
        if (cancelled) return;
        setSearchResults(results);
        setSearchIndex(0);
        if (results[0]) void jumpToMessage(results[0]._id, results[0].createdAt);
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 320);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [searchQuery, searchOpen, conversationId, jumpToMessage]);

  function stepSearch(delta: 1 | -1) {
    if (!searchResults.length) return;
    const next = Math.min(searchResults.length - 1, Math.max(0, searchIndex + delta));
    setSearchIndex(next);
    const hit = searchResults[next];
    if (hit) void jumpToMessage(hit._id, hit.createdAt);
  }

  function closeSearch() {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  }

  // ---------------------------------------------------------------------------------------------
  // Sending

  function armFailTimer(tempId: string) {
    clearPendingTimer(tempId);
    pendingTimers.current.set(
      tempId,
      setTimeout(() => {
        pendingTimers.current.delete(tempId);
        setMessages((prev) => prev.map((m) => (m._id === tempId ? { ...m, pending: false, failed: true } : m)));
      }, SEND_TIMEOUT_MS),
    );
  }

  function stopTypingNow() {
    if (typingEmit.current.stop) clearTimeout(typingEmit.current.stop);
    typingEmit.current.stop = null;
    if (typingEmit.current.last) {
      typingEmit.current.last = 0;
      socket?.emit('stopTyping', conversationId);
    }
  }

  // Throttled: at most one "typing" ping per 2.5s while keys are flying, and an automatic
  // "stopped" 3s after the last keystroke (the server rate-limits floods anyway).
  function handleTyping() {
    if (!socket) return;
    const now = Date.now();
    if (now - typingEmit.current.last > 2500) {
      typingEmit.current.last = now;
      socket.emit('typing', conversationId);
    }
    if (typingEmit.current.stop) clearTimeout(typingEmit.current.stop);
    typingEmit.current.stop = setTimeout(stopTypingNow, 3000);
  }

  function emitSend(
    payload: {
      text: string;
      attachments?: Message['attachments'];
      replyTo?: string;
      poll?: { question: string; options: string[]; multiple: boolean };
      effect?: MessageEffect | null;
      silent?: boolean;
    },
    tempId: string,
  ) {
    if (!socket) return;
    socket.emit('sendMessage', {
      conversationId,
      text: payload.text,
      ...(payload.attachments?.length ? { attachments: payload.attachments } : {}),
      ...(payload.replyTo ? { replyTo: payload.replyTo } : {}),
      ...(payload.poll ? { poll: payload.poll } : {}),
      ...(payload.effect ? { effect: payload.effect } : {}),
      ...(payload.silent ? { silent: true } : {}),
    });
    stopTypingNow();
    track(AnalyticsEvent.MessageSent, {
      conversation_type: conversation?.visibility === 'public' ? 'group_public' : conversation?.isGroup ? 'group' : 'dm',
      has_attachment: !!payload.attachments?.length,
    });
    armFailTimer(tempId);
  }

  async function handleSend(payload: SendPayload): Promise<boolean> {
    if (!user) return false;
    const replyTo = replyingTo?._id;

    if (payload.scheduleAt) {
      try {
        await chatApi.schedule(conversationId, {
          text: payload.text,
          attachments: payload.attachments,
          replyTo,
          effect: payload.effect ?? undefined,
          silent: payload.silent,
          sendAt: payload.scheduleAt,
        });
        showToast(`ستُرسل ${formatFullDate(payload.scheduleAt)}`);
        setReplyingTo(null);
        void refreshScheduled();
        return true;
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : 'تعذّرت جدولة الرسالة.', 'error');
        return false;
      }
    }

    if (!socket) {
      showToast('لا يوجد اتصال الآن — حاول بعد لحظات.', 'error');
      return false;
    }
    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const optimistic: Message = {
      _id: tempId,
      conversation: conversationId,
      sender: user,
      text: payload.text,
      attachments: payload.attachments,
      replyTo: replyingTo ? toReplyPreview(replyingTo) : null,
      effect: payload.effect ?? null,
      readBy: [],
      createdAt: new Date().toISOString(),
      pending: true,
      sendOptions: { silent: payload.silent, effect: payload.effect ?? null, replyTo },
    };
    setMessages((prev) => [...prev, optimistic]);
    emitSend({ text: payload.text, attachments: payload.attachments, replyTo, effect: payload.effect, silent: payload.silent }, tempId);
    playChatSound('sent');
    if (payload.effect) playChatEffect(payload.effect);
    setReplyingTo(null);
    return true;
  }

  function handleCreatePoll(poll: { question: string; options: string[]; multiple: boolean }) {
    if (!user || !socket) return;
    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setMessages((prev) => [
      ...prev,
      {
        _id: tempId,
        conversation: conversationId,
        sender: user,
        text: '',
        poll: {
          question: poll.question,
          multiple: poll.multiple,
          closed: false,
          options: poll.options.map((text, i) => ({ id: `o${i + 1}`, text, voters: [] })),
        },
        readBy: [],
        createdAt: new Date().toISOString(),
        pending: true,
      },
    ]);
    emitSend({ text: '', poll }, tempId);
  }

  function handleRetry(message: Message) {
    if (!message.failed) return;
    setMessages((prev) => prev.map((m) => (m._id === message._id ? { ...m, failed: false, pending: true } : m)));
    emitSend(
      {
        text: message.text,
        attachments: message.attachments,
        replyTo: message.sendOptions?.replyTo,
        poll: message.poll
          ? { question: message.poll.question, options: message.poll.options.map((o) => o.text), multiple: message.poll.multiple }
          : undefined,
        effect: message.sendOptions?.effect,
        silent: message.sendOptions?.silent,
      },
      message._id,
    );
  }

  // ---------------------------------------------------------------------------------------------
  // Message actions

  function handleReact(message: Message, emoji: string) {
    if (isPlaceholderId(message._id)) return;
    socket?.emit('reactToMessage', { messageId: message._id, emoji });
  }

  function handleSubmitEdit(messageId: string, text: string) {
    if (isPlaceholderId(messageId)) return;
    socket?.emit('editMessage', { messageId, text });
    setEditingMessage(null);
  }

  function handleDelete(message: Message, forEveryone: boolean) {
    if (isPlaceholderId(message._id)) {
      clearPendingTimer(message._id);
      setMessages((prev) => prev.filter((m) => m._id !== message._id));
      return;
    }
    socket?.emit('deleteMessage', { messageId: message._id, forEveryone });
  }

  async function toggleStar(list: Message[]) {
    const real = list.filter((m) => !isPlaceholderId(m._id) && !m.deletedForEveryone);
    if (!real.length) return;
    const allStarred = real.every((m) => m.starredBy?.includes(userId));
    try {
      const updated = await Promise.all(
        real
          .filter((m) => allStarred || !m.starredBy?.includes(userId))
          .map((m) =>
            allStarred ? api.delete<Message>(`/chat/messages/${m._id}/star`) : api.post<Message>(`/chat/messages/${m._id}/star`),
          ),
      );
      const byId = new Map(updated.map((m) => [m._id, m]));
      setMessages((prev) => prev.map((m) => byId.get(m._id) ?? m));
      if (real.length > 1) showToast(allStarred ? 'تم إلغاء التمييز.' : 'تم التمييز بنجمة.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر تنفيذ الإجراء.', 'error');
    }
  }

  function copyMessages(list: Message[]) {
    const sorted = [...list].filter((m) => !m.deletedForEveryone).sort(byCreatedAt);
    if (!sorted.length) return;
    const body =
      sorted.length === 1
        ? stripMentionTokens(sorted[0].text || sorted[0].poll?.question || '')
        : sorted
            .map(
              (m) =>
                `[${formatClock(m.createdAt)}] ${m.sender?.name ?? ''}: ${stripMentionTokens(m.text || '') || messagePreview(m)}`,
            )
            .join('\n');
    if (!body) return;
    void navigator.clipboard
      ?.writeText(body)
      .then(() => showToast(sorted.length > 1 ? `تم نسخ ${sorted.length} رسائل.` : 'تم النسخ.'))
      .catch(() => showToast('تعذّر النسخ.', 'error'));
  }

  async function translate(message: Message) {
    const target = translationTarget(message.text);
    setTranslations((prev) => ({ ...prev, [message._id]: { status: 'loading', target } }));
    try {
      const { text } = await chatApi.ai.translate(message._id, target);
      setTranslations((prev) => ({ ...prev, [message._id]: { status: 'done', text, target } }));
    } catch (err) {
      setTranslations((prev) => ({ ...prev, [message._id]: { status: 'error', target } }));
      showToast(err instanceof ApiError ? err.message : 'تعذّرت الترجمة.', 'error');
    }
  }

  function handleVote(message: Message, optionIds: string[]) {
    if (!socket || !message.poll || isPlaceholderId(message._id)) return;
    // Optimistic: reflect my vote instantly; the server echo ('messageUpdated') then wins.
    setMessages((prev) =>
      prev.map((m) =>
        m._id !== message._id || !m.poll
          ? m
          : {
              ...m,
              poll: {
                ...m.poll,
                options: m.poll.options.map((o) => ({
                  ...o,
                  voters: optionIds.includes(o.id)
                    ? [...o.voters.filter((v) => v !== userId), userId]
                    : o.voters.filter((v) => v !== userId),
                })),
              },
            },
      ),
    );
    socket.emit('votePoll', { messageId: message._id, optionIds });
  }

  function toggleSelect(message: Message) {
    if (isPlaceholderId(message._id)) return;
    setSelection((prev) => {
      const current = prev ?? [];
      const next = current.includes(message._id) ? current.filter((id) => id !== message._id) : [...current, message._id];
      return next.length ? next : null;
    });
  }

  function editLastMessage() {
    for (let i = messagesRef.current.length - 1; i >= 0; i--) {
      const m = messagesRef.current[i];
      if (m.sender?._id === userId && m.text?.trim() && !m.poll && !m.deletedForEveryone && !isPlaceholderId(m._id)) {
        setEditingMessage(m);
        return;
      }
    }
  }

  function handleOverlayAction(key: MessageActionKey, message: Message) {
    switch (key) {
      case 'reply':
        setReplyingTo(message);
        break;
      case 'copy':
        copyMessages([message]);
        break;
      case 'forward':
        setForwardTargets([message]);
        break;
      case 'pin':
      case 'unpin':
        socket?.emit('pinMessage', { messageId: message._id, pin: key === 'pin' });
        break;
      case 'star':
        void toggleStar([message]);
        break;
      case 'translate':
        void translate(message);
        break;
      case 'info':
        setMessageInfoTarget(message);
        break;
      case 'reactions':
        setReactionsTarget(message);
        break;
      case 'select':
        setSelection([message._id]);
        break;
      case 'edit':
        setEditingMessage(message);
        break;
      case 'closePoll':
        socket?.emit('closePoll', { messageId: message._id });
        break;
      case 'remind':
        setRemindTarget(message);
        break;
      case 'thread':
        setThreadTarget(message);
        break;
      case 'saveSticker': {
        const sticker = message.attachments?.find((a) => a.type === 'sticker');
        if (sticker) {
          api
            .post('/users/me/stickers', { url: sticker.url })
            .then(() => showToast('تمت إضافة الملصق إلى ملصقاتك.'))
            .catch((err) => showToast(err instanceof ApiError ? err.message : 'تعذّر حفظ الملصق.', 'error'));
        }
        break;
      }
      case 'deleteForMe':
        handleDelete(message, false);
        break;
      case 'deleteForEveryone':
        handleDelete(message, true);
        break;
    }
  }

  async function handleForwardConfirm(conversationIds: string[]) {
    if (!forwardTargets?.length || !socket) return;
    const ids = [...forwardTargets].sort(byCreatedAt).map((m) => m._id);
    socket.emit('forwardMessage', ids.length === 1 ? { messageId: ids[0], conversationIds } : { messageIds: ids, conversationIds });
    showToast(ids.length > 1 ? `تمت إعادة توجيه ${ids.length} رسائل.` : 'تمت إعادة التوجيه.');
    setForwardTargets(null);
    setSelection(null);
  }

  function deleteSelection(forEveryone: boolean) {
    selectedMessages.forEach((m) => handleDelete(m, forEveryone && m.sender?._id === userId));
    setDeleteSelectionOpen(false);
    setSelection(null);
  }

  async function handleUnblock() {
    if (!avatarUser) return;
    const updated = await api.delete<User>(`/users/${avatarUser._id}/block`);
    updateLocalUser(updated);
  }

  async function handleCall(callType: 'audio' | 'video') {
    if (!conversation || conversation.isGroup || !user) return;
    const other = conversationAvatarUser(conversation, user._id);
    if (!other) return;
    await startCall({ userId: other._id, name: other.name, photoUrl: other.photoUrl }, conversationId, callType);
  }

  async function toggleMute() {
    if (!conversation) return;
    const muted = isMuted(conversation, userId);
    try {
      await chatApi.markMuted(conversationId, !muted);
      await refresh();
      showToast(muted ? 'تم إلغاء كتم الإشعارات.' : 'تم كتم إشعارات هذه المحادثة.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر تنفيذ الإجراء.', 'error');
    }
  }

  async function exportChat() {
    try {
      showToast('جارٍ تجهيز ملف المحادثة…');
      const all = (await chatApi.since(conversationId, new Date(0).toISOString())).slice().reverse();
      const typeLabel: Record<string, string> = { image: 'صورة', video: 'فيديو', audio: 'ملف صوتي', voice: 'رسالة صوتية', document: 'مستند' };
      const lines = all.map((m) => {
        const d = new Date(m.createdAt);
        const stamp = `${d.toLocaleDateString('en-CA')} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
        const body = m.deletedForEveryone
          ? '[رسالة محذوفة]'
          : [
              stripMentionTokens(m.text ?? ''),
              m.poll ? `[استطلاع: ${m.poll.question} — ${m.poll.options.map((o) => `${o.text} (${o.voters.length})`).join('، ')}]` : '',
              ...(m.attachments ?? []).map((a) => `[${typeLabel[a.type] ?? 'مرفق'}: ${a.name ?? assetUrl(a.url) ?? ''}]`),
            ]
              .filter(Boolean)
              .join(' ');
        return `[${stamp}] ${m.sender?.name ?? 'مستخدم محذوف'}: ${body}`;
      });
      const header = `محادثة: ${title}\nتاريخ التصدير: ${formatFullDate(new Date())}\nعدد الرسائل: ${all.length}\n${'-'.repeat(32)}\n`;
      const safeName = title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'chat';
      await saveBlob(new Blob([header + lines.join('\n')], { type: 'text/plain;charset=utf-8' }), `${safeName}.txt`);
    } catch {
      showToast('تعذّر تصدير المحادثة.', 'error');
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Stable actions for the memoized bubbles (forward to the latest closures via a ref)

  const handlers = useRef<ChatThreadActions | null>(null);
  handlers.current = {
    reply: (m) => setReplyingTo(m),
    react: handleReact,
    openActions: (m, anchor) => {
      if (selection) {
        toggleSelect(m);
        return;
      }
      setOverlay({ message: m, rect: anchor.getBoundingClientRect(), isOwn: m.sender?._id === userId });
    },
    toggleSelect,
    jumpTo: (id, createdAt) => void jumpToMessage(id, createdAt),
    retry: handleRetry,
    openImage: (m, index) => setImagePreview({ message: m, index }),
    vote: handleVote,
    closePoll: (m) => socket?.emit('closePoll', { messageId: m._id }),
    showReactions: (m) => setReactionsTarget(m),
    showPollVotes: (m) => setPollVotesTarget(m),
    replayEffect: (m) => m.effect && playChatEffect(m.effect),
    hideTranslation: (id) =>
      setTranslations((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      }),
    call: (type) => void handleCall(type),
    openThread: (m) => setThreadTarget(m),
  };
  const actions = useMemo<ChatThreadActions>(
    () => ({
      reply: (m) => handlers.current?.reply(m),
      react: (m, e) => handlers.current?.react(m, e),
      openActions: (m, a) => handlers.current?.openActions(m, a),
      toggleSelect: (m) => handlers.current?.toggleSelect(m),
      jumpTo: (id, t) => handlers.current?.jumpTo(id, t),
      retry: (m) => handlers.current?.retry(m),
      openImage: (m, i) => handlers.current?.openImage(m, i),
      vote: (m, ids) => handlers.current?.vote(m, ids),
      closePoll: (m) => handlers.current?.closePoll(m),
      showReactions: (m) => handlers.current?.showReactions(m),
      showPollVotes: (m) => handlers.current?.showPollVotes(m),
      replayEffect: (m) => handlers.current?.replayEffect(m),
      hideTranslation: (id) => handlers.current?.hideTranslation(id),
      call: (type) => handlers.current?.call(type),
      openThread: (m) => handlers.current?.openThread(m),
    }),
    [],
  );
  const threadInfo = useMemo(
    () => ({ currentUserId: userId, isGroup: !!conversation?.isGroup, participantsById }),
    [userId, conversation?.isGroup, participantsById],
  );

  // ---------------------------------------------------------------------------------------------
  // Keyboard + drag & drop

  function handleRootKeyDown(e: React.KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      setSearchOpen(true);
      return;
    }
    if (e.key === 'Escape') {
      if (selection) setSelection(null);
      else if (searchOpen) closeSearch();
    }
  }

  const draggingFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

  // Jump-to-date: tapping a day divider opens the native date picker on a hidden input.
  function openDatePicker() {
    const input = dateInputRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (!input) return;
    try {
      if (typeof input.showPicker === 'function') input.showPicker();
      else input.click();
    } catch {
      input.focus();
    }
  }

  if (!user) return null;

  const title = conversation ? conversationTitle(conversation, user._id) : 'جارٍ التحميل…';
  const avatarUser = conversation ? conversationAvatarUser(conversation, user._id) : undefined;
  const isGroup = !!conversation?.isGroup;
  const blockedByMe = !isGroup && !!avatarUser && !!user.blockedUsers?.includes(avatarUser._id);
  const canPin = conversation ? canPinInConversation(conversation, user._id) : false;
  const muted = conversation ? isMuted(conversation, user._id) : false;
  const statusOf = (m: Message) => (conversation ? tickStatus(m, conversation, user._id) : 'sent');

  const typingUsers = typingIds.map((id) => participantsById.get(id)).filter((u): u is User => !!u);
  const recordingUsers = recordingIds.map((id) => participantsById.get(id)).filter((u): u is User => !!u);
  const onlineCount = isGroup ? otherParticipants(conversation!, user._id).filter((p) => p.isOnline).length : 0;
  const memberCount = conversation?.participants.filter(Boolean).length ?? 0;
  const isSelf = !!conversation?.isSelf;
  const isClass = !!conversation?.classKey;
  const presence = !isGroup && !isSelf ? presenceLabel(avatarUser, user) : null;
  const showOnline = !isGroup && !isSelf && !!avatarUser?.isOnline && canSeePresence(avatarUser, user);
  const streak = !isGroup && !isSelf && user.chatStreaksEnabled ? (conversation?.streak?.count ?? 0) : 0;

  const subtitle: React.ReactNode = recordingUsers.length ? (
    <span className="flex items-center gap-1.5 font-medium text-accent">
      <Mic className="h-3.5 w-3.5 animate-pulse" />
      {isGroup ? `${recordingUsers[0].name.split(/\s+/)[0]} يسجل رسالة صوتية…` : 'يسجل رسالة صوتية…'}
    </span>
  ) : typingUsers.length ? (
    <span className="flex items-center gap-1.5 font-medium text-accent">
      <TypingDots />
      {isGroup ? typingLabel(typingUsers.map((u) => u.name)) : 'يكتب الآن…'}
    </span>
  ) : rafedTyping ? (
    <span className="flex items-center gap-1.5 font-medium text-accent">
      <Sparkles className="h-3.5 w-3.5 animate-pulse" /> رافد يكتب…
    </span>
  ) : isSelf ? (
    'ملاحظاتك وروابطك الخاصة — لا يراها أحد غيرك'
  ) : isClass ? (
    `دفعتك · ${memberCount} طالبًا`
  ) : isGroup ? (
    `${memberCount} عضوًا${onlineCount ? ` · ${onlineCount} متصل الآن` : ''}`
  ) : streak >= 2 ? (
    <span className="flex items-center gap-1 font-medium text-orange-500">
      <Flame className="h-3.5 w-3.5" /> {streak} يومًا متتاليًا
      {showOnline && <span className="ms-1 text-success">· متصل الآن</span>}
    </span>
  ) : showOnline ? (
    <span className="flex items-center gap-1.5 text-success">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" /> متصل الآن
    </span>
  ) : presence ? (
    presence
  ) : avatarUser ? (
    <RoleBadge role={avatarUser.role} />
  ) : null;

  const menuItems: DropdownItem[] = [
    { label: isGroup ? 'معلومات المجموعة' : 'معلومات جهة الاتصال', icon: Info, onClick: () => setInfoOpen(true) },
    { label: 'بحث في المحادثة', icon: Search, onClick: () => setSearchOpen(true) },
    { label: 'ملخص ذكي', icon: Sparkles, onClick: () => setSummaryOpen(true) },
    ...(!isGroup && conversation
      ? [
          { label: 'مكالمة صوتية', icon: Phone, onClick: () => void handleCall('audio') },
          { label: 'مكالمة فيديو', icon: Video, onClick: () => void handleCall('video') },
        ]
      : []),
    {
      label: scheduled.length ? `الرسائل المجدولة (${scheduled.length})` : 'الرسائل المجدولة',
      icon: CalendarClock,
      onClick: () => setScheduledOpen(true),
    },
    { label: 'تحديد رسائل', icon: CheckSquare, onClick: () => setSelection([]) },
    { label: 'مظهر المحادثة', icon: Palette, onClick: () => setBackgroundModalOpen(true) },
    // Only groups can be muted -- private chats always notify.
    ...(isGroup
      ? [{ label: muted ? 'إلغاء كتم الإشعارات' : 'كتم الإشعارات', icon: muted ? Bell : BellOff, onClick: () => void toggleMute() }]
      : []),
    { label: 'تصدير المحادثة', icon: Download, onClick: () => void exportChat() },
  ];
  const lastMessageId = [...messages].reverse().find((m) => !isPlaceholderId(m._id))?._id ?? null;

  const selectionMode = selection !== null;
  const canDeleteForEveryone =
    selectedMessages.length > 0 && selectedMessages.every((m) => m.sender?._id === user._id && !m.deletedForEveryone);
  const imageGallery = imagePreview
    ? (imagePreview.message.attachments ?? [])
        .filter((a) => a.type === 'image')
        .map((a) => ({ url: assetUrl(a.url) ?? '', name: a.name ?? 'صورة' }))
    : [];
  const unreadAtOpen = unreadAtOpenRef.current.count;
  const showCatchUp = unreadAtOpen >= CATCH_UP_THRESHOLD && !catchUpDismissed && !loading && !!firstUnreadId;

  // ---------------------------------------------------------------------------------------------
  // Render

  return (
    <ChatThreadActionsContext.Provider value={actions}>
      <ChatThreadInfoContext.Provider value={threadInfo}>
        {/* The wallpaper spans the whole window, so the glass header and the floating composer
            sit on the same canvas as the messages. A chosen preset/photo replaces the default. */}
        <div
          className={cn('relative flex h-full min-h-0 flex-col', !background && 'chat-wallpaper')}
          style={{ ...chatAccentVars(accent), ...chatBackgroundStyle(background) }}
          onKeyDown={handleRootKeyDown}
          onDragEnter={(e) => {
            if (!draggingFiles(e) || blockedByMe) return;
            e.preventDefault();
            dragDepth.current += 1;
            setDragActive(true);
          }}
          onDragOver={(e) => {
            if (draggingFiles(e)) e.preventDefault();
          }}
          onDragLeave={(e) => {
            if (!draggingFiles(e)) return;
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (dragDepth.current === 0) setDragActive(false);
          }}
          onDrop={(e) => {
            if (!draggingFiles(e)) return;
            e.preventDefault();
            dragDepth.current = 0;
            setDragActive(false);
            if (!blockedByMe) composerRef.current?.addFiles(Array.from(e.dataTransfer.files));
          }}
        >
          {/* Header (glass) / selection bar */}
          {/* On phones this is the top edge of the screen (the app bar is hidden in a thread), so it
              also clears the status bar / notch of the installed PWA. */}
          <div className="relative z-30 border-b border-border/50 bg-surface/75 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150 md:pt-0">
            {selectionMode ? (
              <SelectionBar
                count={selectedMessages.length}
                canCopy={selectedMessages.some((m) => !m.deletedForEveryone && (m.text || m.poll))}
                canForward={selectedMessages.length > 0 && selectedMessages.every((m) => !m.deletedForEveryone)}
                allStarred={selectedMessages.length > 0 && selectedMessages.every((m) => m.starredBy?.includes(user._id))}
                onCopy={() => {
                  copyMessages(selectedMessages);
                  setSelection(null);
                }}
                onStar={() => {
                  void toggleStar(selectedMessages);
                  setSelection(null);
                }}
                onForward={() => setForwardTargets(selectedMessages)}
                onDelete={() => selectedMessages.length && setDeleteSelectionOpen(true)}
                onClose={() => setSelection(null)}
              />
            ) : (
              <ChatHeader
                title={title}
                avatarSrc={assetUrl(conversation?.groupIcon ?? avatarUser?.photoUrl)}
                online={showOnline}
                subtitle={subtitle}
                canCall={!isGroup && !isSelf && !!conversation}
                avatarIcon={
                  isSelf ? (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-accent text-white">
                      <Bookmark className="h-5 w-5" />
                    </span>
                  ) : isClass ? (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                      <GraduationCap className="h-5 w-5" />
                    </span>
                  ) : undefined
                }
                onVoiceRoom={isGroup ? () => setVoiceJoinSignal((n) => n + 1) : undefined}
                onOpenInfo={() => setInfoOpen(true)}
                onCall={(type) => void handleCall(type)}
                onSearch={() => setSearchOpen((v) => !v)}
                onSummary={() => setSummaryOpen(true)}
                menuItems={menuItems}
              />
            )}
          </div>

          <AnimatePresence initial={false}>
            {searchOpen && (
              <ChatSearchBar
                key="search"
                query={searchQuery}
                onQueryChange={setSearchQuery}
                results={searchResults}
                index={searchIndex}
                loading={searchLoading}
                onStep={stepSearch}
                onPick={(i) => {
                  setSearchIndex(i);
                  const hit = searchResults[i];
                  if (hit) void jumpToMessage(hit._id, hit.createdAt);
                }}
                onClose={closeSearch}
              />
            )}
            {!searchOpen && pins.length > 0 && (
              <PinnedBanner
                key="pins"
                pins={pins}
                index={Math.min(pinIndex, pins.length - 1)}
                onJump={(pin) => {
                  void jumpToMessage(pin.message._id, pin.message.createdAt);
                  setPinIndex((i) => (i + 1) % pins.length);
                }}
                onUnpin={canPin ? (pin) => socket?.emit('pinMessage', { messageId: pin.message._id, pin: false }) : undefined}
              />
            )}
          </AnimatePresence>

          {isGroup && <GroupVoiceRoom conversationId={conversationId} joinSignal={voiceJoinSignal} />}

          {/* Thread */}
          <div className="relative flex min-h-0 flex-1 flex-col">
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              // The bottom edge fades out instead of cutting bubbles off above the floating composer.
              className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3 pt-2 scrollbar-thin [-webkit-mask-image:linear-gradient(to_top,transparent,#000_14px)] [mask-image:linear-gradient(to_top,transparent,#000_14px)] [overflow-anchor:none] sm:px-6"
            >
              <div ref={contentRef} className="mx-auto flex min-h-full w-full max-w-3xl flex-col">
                {loadError && messages.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center">
                    <LoadError title="تعذّر تحميل الرسائل" onRetry={() => setReloadKey((k) => k + 1)} />
                  </div>
                ) : loading ? (
                  <div className="flex flex-1 items-center justify-center">
                    <Spinner className="h-6 w-6" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface shadow-elev-2 ring-1 ring-border/60">
                      <MessageCircle className="h-7 w-7 text-accent" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">لا توجد رسائل بعد</p>
                      <p className="mt-1 text-xs text-muted-foreground">قل مرحبًا وابدأ المحادثة — أو اكتب / لاكتشاف الأوامر</p>
                    </div>
                    {!blockedByMe && (
                      <div className="mt-1 flex flex-wrap justify-center gap-2">
                        {['👋', 'السلام عليكم', 'مرحبًا! كيف حالك؟'].map((starter) => (
                          <button
                            key={starter}
                            type="button"
                            onClick={() => void handleSend({ text: starter })}
                            className={cn(
                              'rounded-full bg-surface px-4 py-2 text-sm font-medium text-foreground shadow-elev-1 ring-1 ring-border/60 transition-transform hover:-translate-y-0.5 hover:ring-accent/40 active:scale-95',
                              starter === '👋' && 'text-xl',
                            )}
                          >
                            {starter}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex-1">
                    <div className="flex h-10 items-center justify-center">
                      {loadingOlder ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : !hasMore ? (
                        <span className="rounded-full bg-surface/70 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur-sm">
                          بداية المحادثة
                        </span>
                      ) : null}
                    </div>
                    {chatRows.map((row) => {
                        if (row.kind === 'day') {
                          return <DayDivider key={row.id} label={row.label} onPick={() => openDatePicker()} />;
                        }
                        if (row.kind === 'unread') {
                          return (
                            <div key={row.id} ref={unreadDividerRef}>
                              <UnreadDivider />
                            </div>
                          );
                        }
                        const message = row.message;
                        const isOwn = message.sender?._id === user._id;
                        const hasReactions = !!message.reactions?.length;
                        // Only what's sent or arrives while the thread is open springs in (from its
                        // sender's corner); the initial load and older pages just appear.
                        const sentKey = sentRowKeys.current.get(message._id);
                        const fresh =
                          isPlaceholderId(message._id) ||
                          !!sentKey ||
                          (!isOwn && new Date(message.createdAt).getTime() > openedAt.current);
                        const rowProps = {
                          ref: (el: HTMLDivElement | null) => {
                            messageRefs.current[message._id] = el;
                          },
                          className: cn(row.flags.lastInGroup ? 'mb-3' : 'mb-1', hasReactions && 'mb-3'),
                        };
                        const bubble = (
                          <MessageBubble
                            message={message}
                            isOwn={isOwn}
                            isGroup={isGroup}
                            showAvatar={row.flags.lastInGroup}
                            showName={row.flags.showName}
                            firstInGroup={row.flags.firstInGroup}
                            lastInGroup={row.flags.lastInGroup}
                            deletedCount={row.deletedCount}
                            status={isOwn ? statusOf(message) : 'sent'}
                            currentUserId={user._id}
                            selectionMode={selectionMode}
                            selected={selectedSet.has(message._id)}
                            highlightKey={highlight?.id === message._id ? highlight.key : undefined}
                            searchTerm={activeSearchTerm}
                            translation={translations[message._id]}
                            readerIds={readHeads.get(message._id)}
                            pinned={pinnedIds.has(message._id)}
                          />
                        );
                        return fresh ? (
                          <motion.div
                            key={sentKey ?? row.id}
                            {...rowProps}
                            initial={{ opacity: 0, y: 14, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ type: 'spring', stiffness: 520, damping: 34, mass: 0.7 }}
                            style={{ transformOrigin: isOwn ? '0% 100%' : '100% 100%' }}
                          >
                            {bubble}
                          </motion.div>
                        ) : (
                          <div key={row.id} {...rowProps}>
                            {bubble}
                          </div>
                        );
                      })}
                    <AnimatePresence>
                      {typingUsers.length > 0 && (
                        <TypingBubble
                          key="typing"
                          users={typingUsers}
                          label={typingLabel(typingUsers.map((u) => u.name))}
                        />
                      )}
                      {rafedTyping && (
                        <motion.div
                          key="rafed-typing"
                          initial={{ opacity: 0, y: 10, scale: 0.92 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 6, scale: 0.92 }}
                          className="mb-3 flex items-end gap-1.5"
                          aria-live="polite"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-accent text-white shadow-elev-1">
                            <Sparkles className="h-4 w-4" />
                          </span>
                          <span className="flex items-center gap-2 rounded-[1.15rem] rounded-br-md bg-[rgb(var(--chat-in))] px-3.5 py-2.5 text-[12.5px] font-medium text-accent shadow-[0_1px_2px_rgb(0_0_0/0.1)]">
                            <TypingDots /> رافد يكتب إجابته…
                          </span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
                <div ref={bottomRef} className="h-px" />
              </div>
            </div>

            <AnimatePresence>
              {showCatchUp && (
                <CatchUpChip
                  key="catch-up"
                  count={unreadAtOpen}
                  onSummarize={() => {
                    setCatchUpDismissed(true);
                    setSummaryOpen(true);
                  }}
                  onDismiss={() => setCatchUpDismissed(true)}
                />
              )}
            </AnimatePresence>

            <JumpButtons
              showBottom={showJump || (!atBottom && newCount > 0)}
              newCount={newCount}
              mentionCount={mentionIds.length}
              onBottom={() => scrollToBottom('smooth')}
              onMention={() => {
                const [first, ...rest] = mentionIds;
                setMentionIds(rest);
                if (first) void jumpToMessage(first);
              }}
            />

            <AnimatePresence>{dragActive && <DropOverlay key="drop" />}</AnimatePresence>
          </div>

          {/* Composer */}
          {blockedByMe ? (
            <div className="border-t border-border/50 bg-surface/80 backdrop-blur-xl">
              <div className="mx-auto flex w-full max-w-3xl items-center justify-center gap-2 px-4 py-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] text-center text-sm text-muted-foreground">
                <ShieldOff className="h-4 w-4 shrink-0" />
                لقد قمت بحظر هذا المستخدم.
                <button type="button" onClick={() => void handleUnblock()} className="font-medium text-accent hover:underline">
                  إلغاء الحظر
                </button>
              </div>
            </div>
          ) : (
            <MessageInput
              ref={composerRef}
              conversationId={conversationId}
              onSend={handleSend}
              onTyping={handleTyping}
              onStopTyping={stopTypingNow}
              replyingTo={replyingTo}
              onCancelReply={() => setReplyingTo(null)}
              editingMessage={editingMessage}
              onCancelEdit={() => setEditingMessage(null)}
              onSubmitEdit={handleSubmitEdit}
              onEditLast={editLastMessage}
              onCreatePoll={() => setPollModalOpen(true)}
              onOpenSummary={() => setSummaryOpen(true)}
              scheduledCount={scheduled.length}
              onOpenScheduled={() => setScheduledOpen(true)}
              onRecordingChange={handleRecordingChange}
            />
          )}

          <input
            ref={dateInputRef}
            type="date"
            aria-hidden
            tabIndex={-1}
            className="pointer-events-none absolute bottom-0 h-px w-px opacity-0"
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => {
              void jumpToDate(e.target.value);
              e.target.value = '';
            }}
          />

          <ChatEffects />

          <MessageActionsOverlay
            target={overlay}
            onClose={() => setOverlay(null)}
            onAction={handleOverlayAction}
            onReact={handleReact}
            currentUserId={user._id}
            isGroup={isGroup}
            canPin={canPin}
            pinned={!!overlay && pinnedIds.has(overlay.message._id)}
            status={overlay?.isOwn ? statusOf(overlay.message) : 'sent'}
            accentStyle={chatAccentVars(accent)}
          />

          {/* Modals */}
          <MessageThreadModal root={threadTarget} onClose={() => setThreadTarget(null)} />
          <RemindMessageModal message={remindTarget} onClose={() => setRemindTarget(null)} />

          <ForwardModal
            open={!!forwardTargets}
            count={forwardTargets?.length ?? 1}
            onClose={() => setForwardTargets(null)}
            onForward={handleForwardConfirm}
          />
          <ChatBackgroundModal
            open={backgroundModalOpen}
            onClose={() => setBackgroundModalOpen(false)}
            background={background}
            onChange={setBackground}
            accent={accent}
            onAccentChange={setAccent}
          />
          {conversation && (
            <GroupInfoPanel open={infoOpen} onClose={() => setInfoOpen(false)} conversation={conversation} onChanged={refresh} />
          )}
          <CreatePollModal open={pollModalOpen} onClose={() => setPollModalOpen(false)} onCreate={handleCreatePoll} />
          <ScheduledMessagesModal
            open={scheduledOpen}
            onClose={() => setScheduledOpen(false)}
            items={scheduled}
            loading={scheduledLoading}
            onCancel={async (item) => {
              try {
                await chatApi.cancelScheduled(item._id);
                setScheduled((prev) => prev.filter((s) => s._id !== item._id));
              } catch (err) {
                showToast(err instanceof ApiError ? err.message : 'تعذّر حذف الرسالة المجدولة.', 'error');
              }
            }}
            onSendNow={async (item) => {
              try {
                await chatApi.sendScheduledNow(item._id);
                setScheduled((prev) => prev.filter((s) => s._id !== item._id));
              } catch (err) {
                showToast(err instanceof ApiError ? err.message : 'تعذّر الإرسال.', 'error');
              }
            }}
          />
          <AiSummaryModal
            open={summaryOpen}
            onClose={() => setSummaryOpen(false)}
            conversationId={conversationId}
            firstUnreadId={unreadAtOpen > 0 ? firstUnreadId : null}
            unreadCount={unreadAtOpen}
            lastMessageId={lastMessageId}
            onInsert={blockedByMe ? undefined : (text) => composerRef.current?.insertText(text)}
          />
          <MessageInfoModal
            message={messageInfoTarget}
            onClose={() => setMessageInfoTarget(null)}
            participantsById={participantsById}
            isGroup={isGroup}
            currentUserId={user._id}
            status={messageInfoTarget ? statusOf(messageInfoTarget) : 'sent'}
          />
          <ReactionsModal
            message={reactionsTarget}
            onClose={() => setReactionsTarget(null)}
            currentUserId={user._id}
            participantsById={participantsById}
            onRemoveMine={handleReact}
          />
          <PollVotesModal message={pollVotesTarget} onClose={() => setPollVotesTarget(null)} participantsById={participantsById} />

          <Modal
            open={deleteSelectionOpen}
            onClose={() => setDeleteSelectionOpen(false)}
            title={selectedMessages.length === 1 ? 'حذف الرسالة؟' : `حذف ${selectedMessages.length} رسائل؟`}
            className="max-w-sm"
          >
            <div className="flex flex-col gap-2">
              {canDeleteForEveryone && (
                <Button variant="danger" fullWidth onClick={() => deleteSelection(true)}>
                  حذف لدى الجميع
                </Button>
              )}
              <Button variant={canDeleteForEveryone ? 'outline' : 'danger'} fullWidth onClick={() => deleteSelection(false)}>
                حذف لديّ فقط
              </Button>
              <Button variant="ghost" fullWidth onClick={() => setDeleteSelectionOpen(false)}>
                إلغاء
              </Button>
            </div>
          </Modal>

          {imagePreview && imageGallery.length > 0 && (
            <ImagePreviewModal
              src={imageGallery[Math.min(imagePreview.index, imageGallery.length - 1)].url}
              alt={imageGallery[0].name}
              gallery={imageGallery}
              initialIndex={Math.min(imagePreview.index, imageGallery.length - 1)}
              onClose={() => setImagePreview(null)}
              message={imagePreview.message}
              isOwn={imagePreview.message.sender?._id === user._id}
              senderName={imagePreview.message.sender?._id === user._id ? 'أنت' : imagePreview.message.sender?.name ?? 'مستخدم محذوف'}
              senderPhotoUrl={imagePreview.message.sender?.photoUrl ?? null}
              createdAt={imagePreview.message.createdAt}
              caption={imagePreview.message.text}
              onGoToMessage={() => {
                const id = imagePreview.message._id;
                setImagePreview(null);
                void jumpToMessage(id, imagePreview.message.createdAt);
              }}
              onReply={(m) => setReplyingTo(m)}
              onReact={handleReact}
              onForward={(m) => setForwardTargets([m])}
              onToggleStar={(m) => void toggleStar([m])}
              onEdit={(m) => setEditingMessage(m)}
              onDelete={handleDelete}
              currentUserId={user._id}
            />
          )}
        </div>
      </ChatThreadInfoContext.Provider>
    </ChatThreadActionsContext.Provider>
  );
}
