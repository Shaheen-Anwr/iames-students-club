'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowRight,
  AlertTriangle,
  Image as ImageIcon,
  Lock,
  MessageCircle,
  MoreVertical,
  Phone,
  Search,
  ShieldCheck,
  ShieldOff,
  Video,
  X,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Dropdown } from '@/components/ui/Dropdown';
import { RoleBadge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { LoadError } from '@/components/ui/LoadError';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useSocket } from '@/lib/socket-context';
import { conversationAvatarUser, conversationTitle, presenceLabel } from '@/lib/chat-helpers';
import { assetUrl, cn } from '@/lib/utils';
import { buildChatRows } from '@/lib/chat-grouping';
import { AnalyticsEvent, track } from '@/lib/analytics';
import { chatAccentVars, chatBackgroundStyle, useChatAccent, useChatBackground } from '@/lib/chat-background';
import {
  adoptServerId,
  decryptToInner,
  encryptInner,
  encryptText,
  isE2eeAvailable,
  isE2eeEnabledOnThisDevice,
  reconcilePeerIdentity,
  rememberInner,
  rememberOutgoing,
  type MediaInner,
} from '@/lib/e2ee';
import { applyEncryptedInner, toggleReactionLocal } from './apply-encrypted-inner';
import type { Attachment, Message, User, Conversation } from '@/lib/types';
import { useChat } from './ChatProvider';
import { useCall } from './CallProvider';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { EncryptionNote } from './EncryptionNote';
import { DayDivider, UnreadDivider } from './DayDivider';
import { ForwardModal } from './ForwardModal';
import { GroupInfoPanel } from './GroupInfoPanel';
import { ChatBackgroundModal } from './ChatBackgroundModal';
import { ImagePreviewModal } from './ImagePreviewModal';

let typingTimeout: ReturnType<typeof setTimeout> | null = null;

export function ChatWindow({ conversationId }: { conversationId: string }) {
  const { user, updateLocalUser } = useAuth();
  const { socket } = useSocket();
  const { findConversation, refresh } = useChat();
  const { startCall } = useCall();
  const conversation = findConversation(conversationId);

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // Server's verdict on whether this 1:1 is end-to-end encrypted (flag on + both sides have keys).
  // OR'd with the sticky conversation.e2ee flag below.
  const [e2eeRemote, setE2eeRemote] = useState(false);
  // Peer identity-key state for verification: has it changed since we last saw it, is it verified.
  const [peerIdentity, setPeerIdentity] = useState<{ changed: boolean; verified: boolean } | null>(null);
  const [typing, setTyping] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [forwardTarget, setForwardTarget] = useState<Message | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [backgroundModalOpen, setBackgroundModalOpen] = useState(false);
  const [imagePreview, setImagePreview] = useState<{
    url: string;
    name: string;
    message: Message;
    isOwn: boolean;
  } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  // Unread count captured the first time this conversation renders, before ChatProvider zeroes it
  // -- used to place the "unread messages" divider.
  const unreadAtOpenRef = useRef<{ id: string; count: number }>({ id: '', count: 0 });
  const [atBottom, setAtBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);
  // Optimistic sends: temp id -> "mark as failed" timer, cleared when the server echoes back.
  const pendingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const { background, setBackground } = useChatBackground(conversationId);
  const { accent, setAccent } = useChatAccent(conversationId);

  // ========== ULTRA BRUTE‑FORCE PHOTO CORRECTION ==========
  const correctSenderPhoto = (msg: Message, conv: Conversation): Message => {
    if (!msg.sender) return msg;
    const participant = conv.participants.find((p) => p?._id === msg.sender?._id);
    if (participant && participant.photoUrl) {
      msg.sender.photoUrl = participant.photoUrl;
    }
    if (user && msg.sender._id === user._id && user.photoUrl) {
      msg.sender.photoUrl = user.photoUrl;
    }
    if (!msg.sender.photoUrl) {
      msg.sender.photoUrl = '';
    }
    return msg;
  };

  // Keep the latest conversation object reachable from effects that must NOT re-run when it
  // merely changes identity -- the conversations array is rebuilt on every presence/typing ping.
  const conversationRef = useRef(conversation);
  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

  // ========== E2EE ==========
  // The other participant of this 1:1 (null for groups / not-yet-loaded).
  const peerId =
    conversation && !conversation.isGroup
      ? conversation.participants.find((p) => p && p._id !== user?._id)?._id ?? null
      : null;
  const deviceE2eeEnabled = isE2eeEnabledOnThisDevice();
  // This conversation should be encrypted: sticky flag from the server, or both sides currently
  // have key bundles. Groups are never encrypted (v1). Gated on `deviceE2eeEnabled` (which is
  // false whenever the feature flag is off) so a stale sticky `conversation.e2ee` in the DB can't
  // re-activate the encrypted UI after the flag has been switched off -- the thread just behaves
  // as a normal plaintext chat again.
  const e2eeActive = deviceE2eeEnabled && (!!conversation?.e2ee || e2eeRemote) && !!peerId;
  // Only meaningful while the feature is live but the user opted out on THIS device.
  const e2eeLockedOut =
    isE2eeAvailable() && !deviceE2eeEnabled && (!!conversation?.e2ee || e2eeRemote) && !!peerId;
  const peerIdRef = useRef<string | null>(null);
  useEffect(() => {
    peerIdRef.current = peerId;
  }, [peerId]);

  // Ask the server whether this conversation is (or can be) encrypted. 404 / disabled -> stays false.
  useEffect(() => {
    let cancelled = false;
    setE2eeRemote(false);
    api
      .get<{ enabled: boolean }>(`/chat/conversations/${conversationId}/e2ee`)
      .then((r) => {
        if (!cancelled) setE2eeRemote(!!r?.enabled);
      })
      .catch(() => {
        /* flag off, not a DM, or no access -- leave it unencrypted */
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // Track the peer's published identity key -> surface a warning if it changed (new device, or a
  // man in the middle) and remember whether the user has verified the safety number.
  useEffect(() => {
    setPeerIdentity(null);
    if (!e2eeActive || !peerId || !deviceE2eeEnabled) return;
    let cancelled = false;
    void reconcilePeerIdentity(peerId)
      .then((s) => {
        if (!cancelled) setPeerIdentity({ changed: s.changed, verified: s.verified });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [conversationId, e2eeActive, peerId, deviceE2eeEnabled]);

  // Decrypt encrypted messages as they show up (cache-first). Runs oldest -> newest so the very
  // first message, which carries the X3DH handshake header, bootstraps the session before the
  // rest. A generation counter abandons in-flight work when the user switches conversations;
  // `decryptSeen` makes re-runs (triggered by our own setMessages) cheap no-ops.
  const decryptSeen = useRef<Set<string>>(new Set());
  const decryptGen = useRef(0);
  useEffect(() => {
    decryptSeen.current = new Set();
    decryptGen.current += 1;
  }, [conversationId]);
  useEffect(() => {
    if (!deviceE2eeEnabled) return;
    const gen = decryptGen.current;
    const todo = messages.filter(
      (m) => m.encrypted && m.payload && !m.decrypted && !m.decryptFailed && !decryptSeen.current.has(m._id),
    );
    if (!todo.length) return;
    todo.forEach((m) => decryptSeen.current.add(m._id));
    void (async () => {
      for (const m of todo) {
        // Our own outbound messages can't be ratchet-decrypted -- read them from cache only.
        const mine = m.sender?._id === user?._id;
        const { inner, failed } = await decryptToInner(m, mine);
        if (decryptGen.current !== gen) return;
        const senderId = m.sender?._id ?? '';
        const senderName = m.sender?.name ?? '';
        setMessages((prev) => applyEncryptedInner(prev, m._id, senderId, senderName, inner, failed));
      }
    })();
  }, [messages, deviceE2eeEnabled, user?._id]);

  // E2EE off on this device (feature flag off, or opted out): don't leave old encrypted messages
  // spinning on "decrypting…" forever -- flag them so the bubble shows a static placeholder.
  useEffect(() => {
    if (deviceE2eeEnabled) return;
    setMessages((prev) =>
      prev.some((m) => m.encrypted && !m.decrypted && !m.decryptFailed)
        ? prev.map((m) => (m.encrypted && !m.decrypted && !m.decryptFailed ? { ...m, decryptFailed: true } : m))
        : prev,
    );
  }, [messages, deviceE2eeEnabled]);

  // ========== LOAD MESSAGES ==========
  // Depends on conversationId ONLY. It used to also depend on `conversation`, so every presence
  // update (which rebuilds the conversations array, giving `conversation` a new reference)
  // refetched the whole thread and flashed it behind a spinner -- "old messages disappearing".
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    api
      .get<Message[]>(`/chat/conversations/${conversationId}/messages?limit=50`)
      .then((data) => {
        if (cancelled) return;
        const conv = conversationRef.current;
        const corrected = conv ? data.map((msg) => correctSenderPhoto(msg, conv)) : data;
        setMessages(corrected.reverse());
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, reloadKey]);

  // Re-apply sender-photo corrections in place when the conversation object updates
  // (participant avatar changed, list finally loaded) -- without refetching or clearing the thread.
  useEffect(() => {
    if (!conversation) return;
    setMessages((prev) => prev.map((msg) => correctSenderPhoto(msg, conversation)));
  }, [conversation]);

  // Landed on a conversation that isn't in the cached list yet (a brand-new thread opened
  // straight from a notification)? Pull the list once so the header, participants and the
  // socket room-join resolve, instead of getting stuck on a spinner forever.
  const refreshedForMissing = useRef(false);
  useEffect(() => {
    refreshedForMissing.current = false;
  }, [conversationId]);
  useEffect(() => {
    if (!loading && !conversation && !refreshedForMissing.current) {
      refreshedForMissing.current = true;
      refresh();
    }
  }, [loading, conversation, refresh]);

  // ========== SOCKET EVENTS ==========
  useEffect(() => {
    if (!socket || !conversation) return;
    socket.emit('joinConversation', conversationId);
    socket.emit('markRead', conversationId);
    socket.emit('markDelivered', conversationId);

    const onNewMessage = (message: Message) => {
      if (message.conversation !== conversationId) return;
      const corrected = correctSenderPhoto(message, conversation);
      const mine = corrected.sender?._id === user?._id;
      setMessages((prev) => {
        if (prev.some((m) => m._id === corrected._id)) return prev;
        let next = prev;
        if (mine) {
          // Replace the matching optimistic placeholder with the real, server-issued message.
          let dropped = false;
          next = prev.filter((m) => {
            if (dropped || !m.pending) return true;
            const match =
              // An encrypted echo carries no plaintext -- pair it with the first pending
              // encrypted placeholder instead of matching on text. Control carriers
              // (reaction/edit/delete) are never optimistic bubbles, so exclude them.
              (corrected.encrypted && !corrected.control && m.encrypted) ||
              (!!corrected.text && m.text === corrected.text) ||
              (!corrected.text && !corrected.encrypted && (m.attachments?.length ?? 0) > 0);
            if (!match) return true;
            dropped = true;
            const t = pendingTimers.current.get(m._id);
            if (t) clearTimeout(t);
            pendingTimers.current.delete(m._id);
            // Carry the cleartext / media descriptor (and its local cache entry) onto the
            // permanent id so the bubble keeps its content and a reload can still read it.
            if (corrected.encrypted) {
              corrected.text = m.text;
              corrected.decrypted = m.decrypted ?? m.text;
              if (m.media) {
                corrected.media = m.media;
                corrected.localMediaUrl = m.localMediaUrl;
              }
              decryptSeen.current.add(corrected._id);
              adoptServerId(m._id, corrected._id);
            }
            return false;
          });
        }
        return [...next, corrected];
      });
      if (!mine) {
        socket.emit('markRead', conversationId);
        socket.emit('markDelivered', conversationId);
      }
    };

    const onMessageEdited = (message: Message) => {
      if (message.conversation !== conversationId) return;
      const corrected = correctSenderPhoto(message, conversation);
      setMessages((prev) => prev.map((m) => (m._id === corrected._id ? corrected : m)));
    };

    const onMessageDeleted = (payload: any) => {
      if (!payload || !payload.message) return;
      if (payload.message.conversation !== conversationId) return;
      if (payload.forEveryone) {
        const corrected = correctSenderPhoto(payload.message, conversation);
        setMessages((prev) => prev.map((m) => (m._id === corrected._id ? corrected : m)));
      } else {
        setMessages((prev) => prev.filter((m) => m._id !== payload.message._id));
      }
    };

    const onMessageReacted = (message: Message) => {
      if (message.conversation !== conversationId) return;
      const corrected = correctSenderPhoto(message, conversation);
      setMessages((prev) => prev.map((m) => (m._id === corrected._id ? corrected : m)));
    };

    const onMessagesRead = (payload: { conversationId: string; userId: string; messageIds: string[] }) => {
      if (payload.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) =>
          payload.messageIds.includes(m._id) ? { ...m, readBy: [...new Set([...(m.readBy ?? []), payload.userId])] } : m,
        ),
      );
    };

    const onMessagesDelivered = (payload: { conversationId: string; userId: string; messageIds: string[] }) => {
      if (payload.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) =>
          payload.messageIds.includes(m._id)
            ? { ...m, deliveredTo: [...new Set([...(m.deliveredTo ?? []), payload.userId])] }
            : m,
        ),
      );
    };

    const onTyping = (payload: { conversationId: string; userId: string }) => {
      if (payload.conversationId !== conversationId || payload.userId === user?._id) return;
      setTyping(true);
      if (typingTimeout) clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => setTyping(false), 2000);
    };

    const onStopTyping = (payload: { conversationId: string; userId: string }) => {
      if (payload.conversationId !== conversationId || payload.userId === user?._id) return;
      setTyping(false);
    };

    socket.on('newMessage', onNewMessage);
    socket.on('messageEdited', onMessageEdited);
    socket.on('messageDeleted', onMessageDeleted);
    socket.on('messageReacted', onMessageReacted);
    socket.on('messagesRead', onMessagesRead);
    socket.on('messagesDelivered', onMessagesDelivered);
    socket.on('userTyping', onTyping);
    socket.on('userStopTyping', onStopTyping);

    return () => {
      socket.off('newMessage', onNewMessage);
      socket.off('messageEdited', onMessageEdited);
      socket.off('messageDeleted', onMessageDeleted);
      socket.off('messageReacted', onMessageReacted);
      socket.off('messagesRead', onMessagesRead);
      socket.off('messagesDelivered', onMessagesDelivered);
      socket.off('userTyping', onTyping);
      socket.off('userStopTyping', onStopTyping);
    };
  }, [socket, conversationId, user, conversation]);

  // ========== SCROLL / "NEW MESSAGES" PILL ==========
  // WhatsApp behaviour: keep the newest message in view while the user is already at the
  // bottom (or just sent one themselves). If they've scrolled up to read history, don't yank
  // them down -- count the arrivals and show a "N new messages" pill instead; only jump when
  // they tap it (or scroll back down on their own).
  const didInitialScroll = useRef(false);
  const prevCountRef = useRef(0);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior });
    setNewCount(0);
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    setAtBottom(bottom);
    if (bottom) setNewCount(0);
  };

  useEffect(() => {
    didInitialScroll.current = false;
    prevCountRef.current = 0;
    setNewCount(0);
    setAtBottom(true);
  }, [conversationId]);

  // Don't leave optimistic-send fail-timers running after leaving / switching a thread.
  useEffect(() => {
    const timers = pendingTimers.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, [conversationId]);

  useEffect(() => {
    if (loading || searchOpen) return;

    // Count only visible messages -- an encrypted control carrier must not trigger a scroll/pill.
    const visible = messages.filter((m) => !m.control);
    const prev = prevCountRef.current;
    prevCountRef.current = visible.length;

    // First paint of a thread -> jump straight to the newest message, no animation.
    if (!didInitialScroll.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
      didInitialScroll.current = true;
      return;
    }

    const added = visible.length - prev;
    if (added <= 0) return; // edit / reaction / delete / read-receipt -- not a new message

    const lastFromMe = visible[visible.length - 1]?.sender?._id === user?._id;
    if (lastFromMe || atBottom) {
      scrollToBottom('smooth');
    } else {
      setNewCount((n) => n + added);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, loading, searchOpen, atBottom, user?._id]);

  // ========== SEARCH ==========
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      const results = await api.get<Message[]>(
        `/chat/conversations/${conversationId}/search?q=${encodeURIComponent(searchQuery.trim())}`,
      );
      setSearchResults(results);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchQuery, conversationId]);

  // ========== HANDLERS ==========
  // Optimistic send: the message shows instantly with a "sending" clock, then either the server
  // echoes it back (onNewMessage swaps in the real one) or the fail-timer flips it to a
  // tap-to-retry state. No server change needed -- reconciliation matches on sender + text.
  const SEND_TIMEOUT_MS = 12_000;

  function armFailTimer(tempId: string) {
    const t = setTimeout(() => {
      pendingTimers.current.delete(tempId);
      setMessages((prev) =>
        prev.map((m) => (m._id === tempId ? { ...m, pending: false, failed: true } : m)),
      );
    }, SEND_TIMEOUT_MS);
    pendingTimers.current.set(tempId, t);
  }

  function trackSend(hasAttachment: boolean) {
    // Engagement signal — type only, never the text.
    track(AnalyticsEvent.MessageSent, {
      conversation_type:
        conversation?.visibility === 'public' ? 'group_public' : conversation?.isGroup ? 'group' : 'dm',
      has_attachment: hasAttachment,
    });
  }

  function emitSend(
    payload: { text: string; attachments?: Attachment[]; replyTo?: string },
    tempId: string,
  ) {
    if (!socket) return;
    socket.emit('sendMessage', { conversationId, ...payload });
    socket.emit('stopTyping', conversationId);
    trackSend(!!payload.attachments?.length);
    armFailTimer(tempId);
  }

  function markFailed(tempId: string) {
    const t = pendingTimers.current.get(tempId);
    if (t) clearTimeout(t);
    pendingTimers.current.delete(tempId);
    setMessages((prev) =>
      prev.map((m) => (m._id === tempId ? { ...m, pending: false, failed: true } : m)),
    );
  }

  // Encrypt `text` for the peer and emit it as an opaque payload. The optimistic bubble keeps the
  // real cleartext locally; only ciphertext ever leaves the browser.
  async function emitEncrypted(text: string, replyTo: string | undefined, tempId: string) {
    const peer = peerIdRef.current;
    if (!socket || !peer) {
      markFailed(tempId);
      return;
    }
    try {
      const payload = await encryptText(conversationId, peer, text);
      rememberOutgoing(tempId, conversationId, text);
      socket.emit('sendMessage', { conversationId, encrypted: true, payload, replyTo });
      socket.emit('stopTyping', conversationId);
      trackSend(false);
      armFailTimer(tempId);
    } catch {
      markFailed(tempId);
    }
  }

  function handleSend(text: string, attachments?: Attachment[], replyTo?: string) {
    if (!socket || !user) return;
    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const encrypting = e2eeActive && !attachments?.length;
    const optimistic: Message = {
      _id: tempId,
      conversation: conversationId,
      sender: user,
      text,
      attachments,
      encrypted: encrypting,
      decrypted: encrypting ? text : undefined,
      readBy: [],
      createdAt: new Date().toISOString(),
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    if (encrypting) void emitEncrypted(text, replyTo, tempId);
    else emitSend({ text, attachments, replyTo }, tempId);
  }

  function handleRetry(message: Message) {
    if (!message.failed) return;
    setMessages((prev) =>
      prev.map((m) => (m._id === message._id ? { ...m, failed: false, pending: true } : m)),
    );
    if (message.encrypted && message.media) void emitEncryptedMedia(message.media, undefined, message._id);
    else if (message.encrypted) void emitEncrypted(message.text, undefined, message._id);
    else emitSend({ text: message.text, attachments: message.attachments }, message._id);
  }

  // An encrypted reaction/edit/delete: a normal encrypted message flagged `control` so the server
  // stores + relays it (offline delivery, reload replay) but doesn't preview or notify for it.
  // We can't decrypt our own outbound ratchet message on reload, so cache the cleartext against
  // the server id (from the emit ack) -- that's what lets the reaction/edit replay after refresh.
  async function emitControl(inner: Parameters<typeof encryptInner>[2]): Promise<boolean> {
    const peer = peerIdRef.current;
    if (!socket || !peer) return false;
    try {
      const payload = await encryptInner(conversationId, peer, inner);
      socket.emit(
        'sendMessage',
        { conversationId, encrypted: true, payload, control: inner.k !== 'media' },
        (ack?: { messageId?: string }) => {
          if (ack?.messageId) {
            decryptSeen.current.add(ack.messageId);
            rememberInner(ack.messageId, conversationId, inner);
          }
        },
      );
      return true;
    } catch {
      return false;
    }
  }

  // Encrypt an already-uploaded ciphertext attachment's descriptor and send it as a media message.
  async function emitEncryptedMedia(
    media: NonNullable<Message['media']>,
    replyTo: string | undefined,
    tempId: string,
  ) {
    const peer = peerIdRef.current;
    if (!socket || !peer) {
      markFailed(tempId);
      return;
    }
    const inner: MediaInner = { k: 'media', ...media };
    try {
      const payload = await encryptInner(conversationId, peer, inner);
      rememberInner(tempId, conversationId, inner);
      socket.emit('sendMessage', { conversationId, encrypted: true, payload, replyTo });
      socket.emit('stopTyping', conversationId);
      trackSend(true);
      armFailTimer(tempId);
    } catch {
      markFailed(tempId);
    }
  }

  // Called by MessageInput after it has encrypted + uploaded the ciphertext blob(s).
  function handleSendEncryptedMedia(
    drafts: (MediaInner & { localUrl: string })[],
    replyTo?: string,
  ) {
    if (!socket || !user) return;
    for (const draft of drafts) {
      const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const { localUrl, ...media } = draft;
      const optimistic: Message = {
        _id: tempId,
        conversation: conversationId,
        sender: user,
        text: '',
        encrypted: true,
        media,
        localMediaUrl: localUrl,
        decrypted: '​',
        readBy: [],
        createdAt: new Date().toISOString(),
        pending: true,
      };
      setMessages((prev) => [...prev, optimistic]);
      decryptSeen.current.add(tempId);
      void emitEncryptedMedia(media, replyTo, tempId);
    }
  }

  function handleTyping() {
    socket?.emit('typing', conversationId);
  }

  function handleStopTyping() {
    socket?.emit('stopTyping', conversationId);
  }

  // An optimistic message has no server id yet -- edit/react/star/delete would 404, so ignore them.
  const isPlaceholder = (id: string) => id.startsWith('tmp_');

  function handleReact(message: Message, emoji: string) {
    if (isPlaceholder(message._id)) return;
    if (e2eeActive && user) {
      const mine = (message.reactions ?? []).some(
        (r) => (typeof r.user === 'string' ? r.user : r.user._id) === user._id && r.emoji === emoji,
      );
      const op: 'add' | 'remove' = mine ? 'remove' : 'add';
      setMessages((prev) =>
        prev.map((m) =>
          m._id === message._id
            ? { ...m, reactions: toggleReactionLocal(m.reactions, user._id, user.name, emoji, op) }
            : m,
        ),
      );
      void emitControl({ k: 'reaction', target: message._id, emoji, op }).then((ok) => {
        if (ok) return;
        // revert
        setMessages((prev) =>
          prev.map((m) =>
            m._id === message._id
              ? {
                  ...m,
                  reactions: toggleReactionLocal(
                    m.reactions,
                    user._id,
                    user.name,
                    emoji,
                    op === 'add' ? 'remove' : 'add',
                  ),
                }
              : m,
          ),
        );
      });
      return;
    }
    socket?.emit('reactToMessage', { messageId: message._id, emoji });
  }

  function handleSubmitEdit(messageId: string, text: string) {
    if (isPlaceholder(messageId)) return;
    const target = messages.find((m) => m._id === messageId);
    if (e2eeActive && target?.encrypted) {
      setMessages((prev) =>
        prev.map((m) => (m._id === messageId ? { ...m, text, decrypted: text, edited: true } : m)),
      );
      rememberInner(messageId, conversationId, { k: 'text', body: text });
      void emitControl({ k: 'edit', target: messageId, body: text });
      setEditingMessage(null);
      return;
    }
    socket?.emit('editMessage', { messageId, text });
    setEditingMessage(null);
  }

  async function handleDelete(message: Message, forEveryone: boolean) {
    if (isPlaceholder(message._id)) {
      // Purely local: just drop the placeholder and cancel its fail-timer.
      const t = pendingTimers.current.get(message._id);
      if (t) clearTimeout(t);
      pendingTimers.current.delete(message._id);
      setMessages((prev) => prev.filter((m) => m._id !== message._id));
      return;
    }
    // "Delete for everyone" on an encrypted message goes out as a control message; "delete for me"
    // stays on the plain path (server-side it only touches `deletedFor`, no content leak).
    if (e2eeActive && message.encrypted && forEveryone) {
      setMessages((prev) =>
        prev.map((m) => (m._id === message._id ? { ...m, deletedForEveryone: true } : m)),
      );
      void emitControl({ k: 'delete', target: message._id });
      return;
    }
    socket?.emit('deleteMessage', { messageId: message._id, forEveryone });
  }

  async function handleForwardConfirm(conversationIds: string[]) {
    if (!forwardTarget || !user) return;
    const src = forwardTarget;
    setForwardTarget(null);

    // Into an encrypted destination (or from an encrypted source) we can't use the server-side
    // forward -- re-encrypt the local cleartext for each destination's peer instead.
    const plainForwardIds: string[] = [];
    for (const cid of conversationIds) {
      const dest = findConversation(cid);
      const destEncrypted = !!dest?.e2ee || src.encrypted;
      if (!destEncrypted) {
        plainForwardIds.push(cid);
        continue;
      }
      const body = src.encrypted ? src.decrypted || src.text : src.text;
      const peer =
        dest && !dest.isGroup
          ? dest.participants.find((p) => p && p._id !== user._id)?._id
          : null;
      if (!body || !peer) continue; // media / group dest / peer without keys -- skip
      try {
        const payload = await encryptText(cid, peer, body);
        socket?.emit('sendMessage', { conversationId: cid, encrypted: true, payload });
      } catch {
        /* destination peer hasn't enabled E2EE -- silently skip that one */
      }
    }
    if (plainForwardIds.length) {
      socket?.emit('forwardMessage', { messageId: src._id, conversationIds: plainForwardIds });
    }
  }

  async function handleToggleStar(message: Message) {
    if (isPlaceholder(message._id)) return;
    const isStarred = message.starredBy?.includes(user!._id);
    const updated = isStarred
      ? await api.delete<Message>(`/chat/messages/${message._id}/star`)
      : await api.post<Message>(`/chat/messages/${message._id}/star`);
    setMessages((prev) => prev.map((m) => (m._id === updated._id ? updated : m)));
  }

  function jumpToReply(messageId: string) {
    messageRefs.current[messageId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const el = messageRefs.current[messageId];
    if (el) {
      el.classList.add('ring-2', 'ring-accent', 'rounded-2xl');
      setTimeout(() => el.classList.remove('ring-2', 'ring-accent', 'rounded-2xl'), 1200);
    }
  }

  async function handleUnblock() {
    if (!avatarUser) return;
    const updated = await api.delete<User>(`/users/${avatarUser._id}/block`);
    updateLocalUser(updated);
  }

  async function handleCall(callType: 'audio' | 'video') {
    if (!conversation || conversation.isGroup) return;
    const other = conversationAvatarUser(conversation, user!._id);
    if (!other) return;
    await startCall({ userId: other._id, name: other.name, photoUrl: other.photoUrl }, conversationId, callType);
  }

  if (!user) return null;

  // Encrypted control carriers (reaction/edit/delete) live in `messages` for replay + dedup but
  // are never drawn as bubbles.
  const visibleMessages = messages.filter((m) => !m.control);

  // Capture the unread count once per conversation (first render where `conversation` is known).
  if (conversation && unreadAtOpenRef.current.id !== conversationId) {
    unreadAtOpenRef.current = { id: conversationId, count: conversation.unreadCount ?? 0 };
  }
  const firstUnreadId = (() => {
    const cnt = unreadAtOpenRef.current.id === conversationId ? unreadAtOpenRef.current.count : 0;
    if (!cnt) return null;
    let seen = 0;
    for (let i = visibleMessages.length - 1; i >= 0; i--) {
      if (visibleMessages[i].sender?._id === user._id) continue;
      if (++seen === cnt) return visibleMessages[i]._id;
    }
    return null;
  })();
  const chatRows = buildChatRows(visibleMessages, user._id, !!conversation?.isGroup, firstUnreadId);

  const title = conversation ? conversationTitle(conversation, user._id) : 'جارٍ التحميل…';
  const avatarUser = conversation ? conversationAvatarUser(conversation, user._id) : undefined;
  const presence = !conversation?.isGroup ? presenceLabel(avatarUser) : null;
  const blockedByMe =
    !conversation?.isGroup && !!avatarUser && !!user.blockedUsers?.includes(avatarUser._id);

  // ========== RENDER ==========
  return (
    <div className="flex h-full min-h-0 flex-col bg-surface" style={chatAccentVars(accent)}>
      {/* Header */}
      <div className="border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-1.5 px-2 py-3.5 sm:gap-3 sm:px-4">
        <Link
          href="/chat"
          className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground lg:hidden"
        >
          <ArrowRight className="h-5 w-5" />
        </Link>
        <button onClick={() => setInfoOpen(true)} className="flex min-w-0 flex-1 items-center gap-2 text-start sm:gap-3">
          <Avatar src={assetUrl(conversation?.groupIcon ?? avatarUser?.photoUrl)} name={title} size="sm" />
          <div className="min-w-0 flex-1">
            <p dir="auto" className="flex items-center gap-1 truncate text-sm font-semibold text-foreground">
              <span className="truncate">{title}</span>
              {e2eeActive && (
                <Lock className="h-3 w-3 shrink-0 text-emerald-500" aria-label="محادثة مشفّرة من طرف إلى طرف" />
              )}
              {e2eeActive && peerIdentity?.verified && (
                <ShieldCheck className="h-3 w-3 shrink-0 text-emerald-500" aria-label="موثّق" />
              )}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {typing ? (
                <span className="animate-fade-in text-accent">يكتب الآن…</span>
              ) : conversation?.isGroup ? (
                `${conversation.participants.length} أعضاء`
              ) : presence ? (
                presence
              ) : avatarUser ? (
                <RoleBadge role={avatarUser.role} />
              ) : null}
            </p>
          </div>
        </button>
        {/* Desktop: actions inline. Mobile: one overflow menu, so the name/status never gets crushed. */}
        <div className="hidden shrink-0 items-center gap-1 sm:flex">
          {!conversation?.isGroup && (
            <>
              <button
                onClick={() => handleCall('audio')}
                title="مكالمة صوتية"
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-accent"
              >
                <Phone className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleCall('video')}
                title="مكالمة فيديو"
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-accent"
              >
                <Video className="h-4 w-4" />
              </button>
            </>
          )}
          <button
            onClick={() => setBackgroundModalOpen(true)}
            title="خلفية المحادثة"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-accent"
          >
            <ImageIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => setSearchOpen((v) => !v)}
            title="بحث في المحادثة"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-accent"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
        <div className="shrink-0 sm:hidden">
          <Dropdown
            menuLabel="إجراءات المحادثة"
            trigger={
              <span className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-accent">
                <MoreVertical className="h-4 w-4" />
              </span>
            }
            items={[
              { label: 'بحث في المحادثة', icon: Search, onClick: () => setSearchOpen(true) },
              ...(!conversation?.isGroup
                ? [
                    { label: 'مكالمة صوتية', icon: Phone, onClick: () => handleCall('audio') },
                    { label: 'مكالمة فيديو', icon: Video, onClick: () => handleCall('video') },
                  ]
                : []),
              { label: 'خلفية المحادثة', icon: ImageIcon, onClick: () => setBackgroundModalOpen(true) },
            ]}
          />
        </div>
      </div>
      </div>

      {/* Search */}
      {searchOpen && (
        <div className="border-b border-border bg-surface">
        <div className="mx-auto w-full max-w-3xl px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              placeholder="ابحث في المحادثة"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1"
            />
            <button
              onClick={() => {
                setSearchOpen(false);
                setSearchQuery('');
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-2"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {searchQuery.trim() && (
            <div className="mt-2 max-h-56 space-y-1 overflow-y-auto scrollbar-thin">
              {searchResults.length === 0 ? (
                <p className="py-3 text-center text-xs text-muted-foreground">لا نتائج</p>
              ) : (
                searchResults.map((m) => (
                  <button
                    key={m._id}
                    onClick={() => {
                      setSearchOpen(false);
                      jumpToReply(m._id);
                    }}
                    className="block w-full truncate rounded-lg px-2.5 py-2 text-start text-sm hover:bg-surface-2"
                  >
                    <span className="font-medium text-foreground">{m.sender?.name ?? 'مستخدم محذوف'}: </span>
                    <span className="text-muted-foreground">{m.text}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        </div>
      )}

      {/* Messages */}
      <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto bg-surface-2 px-4 py-5 scrollbar-thin sm:px-6"
        style={chatBackgroundStyle(background)}
      >
        {/* Cap the thread to a comfortable reading width and centre it, so bubbles don't stretch
            edge-to-edge (and own-messages don't hug the far side) on a wide conversation pane. */}
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col">
        {!loading && conversation && e2eeActive && !e2eeLockedOut && <EncryptionNote />}
        {!loading && conversation && e2eeActive && !e2eeLockedOut && peerIdentity?.changed && (
          <button
            onClick={() => setInfoOpen(true)}
            className="mx-auto my-2 flex max-w-sm items-start gap-2 rounded-xl bg-amber-500/10 px-3.5 py-2.5 text-start text-[12.5px] leading-relaxed text-amber-900 hover:bg-amber-500/15 dark:text-amber-200"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>تغيّر رمز الأمان في هذه المحادثة. اضغط للتحقق قبل إرسال معلومات حسّاسة.</span>
          </button>
        )}
        {!loading && conversation && e2eeLockedOut && (
          <div className="mx-auto my-3 flex max-w-sm items-start gap-2 rounded-xl bg-danger/10 px-3.5 py-2.5 text-center text-[12.5px] leading-relaxed text-danger">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              التشفير معطّل على هذا الجهاز، فلا يمكن عرض هذه المحادثة المشفّرة أو الرد عليها. فعّله من
              الإعدادات ثم أعد فتح المحادثة.
            </p>
          </div>
        )}
        {loadError && messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <LoadError title="تعذّر تحميل الرسائل" onRetry={() => setReloadKey((k) => k + 1)} />
          </div>
        ) : loading || !conversation ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner className="h-6 w-6" />
          </div>
        ) : visibleMessages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2/70">
              <MessageCircle className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">لا توجد رسائل بعد</p>
              <p className="mt-1 text-xs text-muted-foreground">قل مرحبًا وابدأ المحادثة 👋</p>
            </div>
          </div>
        ) : (
          <div className="flex-1">
          {chatRows.map((row) => {
            if (row.kind === 'day') return <DayDivider key={row.id} label={row.label} />;
            if (row.kind === 'unread') return <UnreadDivider key={row.id} />;
            const message = row.message;
            const isOwn = message.sender?._id === user._id;
            return (
              <div
                key={message._id}
                ref={(el) => { messageRefs.current[message._id] = el; }}
                className={cn('transition-all', row.flags.lastInGroup ? 'mb-3' : 'mb-0.5')}
              >
                <MessageBubble
                  message={message}
                  isOwn={isOwn}
                  showAvatar={row.flags.lastInGroup}
                  showName={row.flags.showName}
                  firstInGroup={row.flags.firstInGroup}
                  lastInGroup={row.flags.lastInGroup}
                  conversation={conversation}
                  currentUserId={user._id}
                  onReply={setReplyingTo}
                  onEdit={setEditingMessage}
                  onDelete={handleDelete}
                  onReact={handleReact}
                  onForward={setForwardTarget}
                  onToggleStar={handleToggleStar}
                  onJumpToReply={jumpToReply}
                  onRetry={handleRetry}
                  onImageClick={(url, name, msg) => setImagePreview({ url, name, message: msg, isOwn })}
                />
              </div>
            );
          })}
          </div>
        )}
        <div ref={bottomRef} />
        </div>
      </div>

        {newCount > 0 && (
          <button
            onClick={() => scrollToBottom('smooth')}
            className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white shadow-elev-2 transition-transform hover:scale-105 active:scale-95"
          >
            <ArrowDown className="h-4 w-4" />
            {newCount > 99 ? '+99' : newCount} رسائل جديدة
          </button>
        )}
      </div>

      {/* Input */}
      {blockedByMe ? (
        <div className="border-t border-border bg-surface">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-center gap-2 px-4 py-3.5 text-center text-sm text-muted-foreground">
            <ShieldOff className="h-4 w-4 shrink-0" />
            لقد قمت بحظر هذا المستخدم.
            <button onClick={handleUnblock} className="font-medium text-accent hover:underline">
              إلغاء الحظر
            </button>
          </div>
        </div>
      ) : e2eeLockedOut ? (
        <div className="border-t border-border bg-surface">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-center gap-2 px-4 py-3.5 text-center text-sm text-muted-foreground">
            <Lock className="h-4 w-4 shrink-0" />
            التشفير معطّل على هذا الجهاز.
          </div>
        </div>
      ) : (
        <MessageInput
          onSend={handleSend}
          onEncryptedMedia={handleSendEncryptedMedia}
          onTyping={handleTyping}
          onStopTyping={handleStopTyping}
          encrypted={e2eeActive}
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
          editingMessage={editingMessage}
          onCancelEdit={() => setEditingMessage(null)}
          onSubmitEdit={handleSubmitEdit}
        />
      )}

      {/* Modals */}
      <ForwardModal open={!!forwardTarget} onClose={() => setForwardTarget(null)} onForward={handleForwardConfirm} />
      <ChatBackgroundModal
        open={backgroundModalOpen}
        onClose={() => setBackgroundModalOpen(false)}
        background={background}
        onChange={setBackground}
        accent={accent}
        onAccentChange={setAccent}
      />
      {conversation && (
        <GroupInfoPanel
          open={infoOpen}
          onClose={() => setInfoOpen(false)}
          conversation={conversation}
          onChanged={refresh}
        />
      )}

      {/* Image Preview with Actions */}
      {imagePreview && (
        <ImagePreviewModal
          src={imagePreview.url}
          alt={imagePreview.name}
          onClose={() => setImagePreview(null)}
          message={imagePreview.message}
          isOwn={imagePreview.isOwn}
          onReply={setReplyingTo}
          onReact={handleReact}
          onForward={setForwardTarget}
          onToggleStar={handleToggleStar}
          onEdit={setEditingMessage}
          onDelete={handleDelete}
          currentUserId={user._id}
        />
      )}
    </div>
  );
}