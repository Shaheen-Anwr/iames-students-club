'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDown, Hash, Info, PanelRight, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useSocket } from '@/lib/socket-context';
import { useGroups } from '@/lib/groups-context';
import { useGroupUi } from '@/lib/group-ui-context';
import type { Attachment, Channel, ChannelMessage } from '@/lib/types';
import { ChannelMessageBubble } from './ChannelMessageBubble';
import { ChannelMessageInput } from './ChannelMessageInput';
import { ChannelInfoPanel } from './ChannelInfoPanel';
import { ImagePreviewModal } from '@/components/chat/ImagePreviewModal';

let typingTimeout: ReturnType<typeof setTimeout> | null = null;

const SEND_TIMEOUT_MS = 12_000;

export function ChannelWindow({ groupId, channelId }: { groupId: string; channelId: string }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const { findGroup } = useGroups();
  const { collapsed, toggleCollapsed, openDrawer } = useGroupUi();
  const group = findGroup(groupId);

  const [channel, setChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [typing, setTyping] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChannelMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChannelMessage | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ url: string; name: string; message: ChannelMessage; isOwn: boolean } | null>(
    null,
  );

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pendingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [atBottom, setAtBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const didInitialScroll = useRef(false);
  const prevCountRef = useRef(0);

  // ---------- load messages + channel meta ----------
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setChannel(null);
    Promise.all([
      api.get<ChannelMessage[]>(`/groups/channels/${channelId}/messages?limit=50`),
      api.get<Channel[]>(`/groups/${groupId}/channels`),
    ]).then(([msgs, channels]) => {
      if (cancelled) return;
      setMessages([...msgs].reverse());
      setChannel(channels.find((c) => c._id === channelId) ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [groupId, channelId]);

  // ---------- socket events ----------
  useEffect(() => {
    if (!socket) return;
    socket.emit('joinChannel', channelId);

    const onNewMessage = (message: ChannelMessage) => {
      if (message.channel !== channelId) return;
      const mine = message.sender?._id === user?._id;
      setMessages((prev) => {
        if (prev.some((m) => m._id === message._id)) return prev;
        let next = prev;
        if (mine) {
          let dropped = false;
          next = prev.filter((m) => {
            if (dropped || !m.pending) return true;
            const match = m.text === message.text || (!message.text && (m.attachments?.length ?? 0) > 0);
            if (!match) return true;
            dropped = true;
            const t = pendingTimers.current.get(m._id);
            if (t) clearTimeout(t);
            pendingTimers.current.delete(m._id);
            return false;
          });
        }
        return [...next, message];
      });
    };

    const onMessageEdited = (message: ChannelMessage) => {
      if (message.channel !== channelId) return;
      setMessages((prev) => prev.map((m) => (m._id === message._id ? message : m)));
    };

    const onMessageDeleted = (payload: { message: ChannelMessage; forEveryone: boolean }) => {
      if (!payload?.message || payload.message.channel !== channelId) return;
      if (payload.forEveryone) {
        setMessages((prev) => prev.map((m) => (m._id === payload.message._id ? payload.message : m)));
      } else {
        setMessages((prev) => prev.filter((m) => m._id !== payload.message._id));
      }
    };

    const onMessageReacted = (message: ChannelMessage) => {
      if (message.channel !== channelId) return;
      setMessages((prev) => prev.map((m) => (m._id === message._id ? message : m)));
    };

    const onTyping = (payload: { channelId: string; userId: string }) => {
      if (payload.channelId !== channelId || payload.userId === user?._id) return;
      setTyping(true);
      if (typingTimeout) clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => setTyping(false), 2000);
    };

    const onStopTyping = (payload: { channelId: string; userId: string }) => {
      if (payload.channelId !== channelId || payload.userId === user?._id) return;
      setTyping(false);
    };

    socket.on('newChannelMessage', onNewMessage);
    socket.on('channelMessageEdited', onMessageEdited);
    socket.on('channelMessageDeleted', onMessageDeleted);
    socket.on('channelMessageReacted', onMessageReacted);
    socket.on('userTypingChannel', onTyping);
    socket.on('userStopTypingChannel', onStopTyping);
    return () => {
      socket.off('newChannelMessage', onNewMessage);
      socket.off('channelMessageEdited', onMessageEdited);
      socket.off('channelMessageDeleted', onMessageDeleted);
      socket.off('channelMessageReacted', onMessageReacted);
      socket.off('userTypingChannel', onTyping);
      socket.off('userStopTypingChannel', onStopTyping);
    };
  }, [socket, channelId, user?._id]);

  // ---------- scroll / "new messages" pill ----------
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
  }, [channelId]);

  useEffect(() => {
    const timers = pendingTimers.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, [channelId]);

  useEffect(() => {
    if (loading) return;
    const prev = prevCountRef.current;
    prevCountRef.current = messages.length;

    if (!didInitialScroll.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
      didInitialScroll.current = true;
      return;
    }

    const added = messages.length - prev;
    if (added <= 0) return;

    const lastFromMe = messages[messages.length - 1]?.sender?._id === user?._id;
    if (lastFromMe || atBottom) {
      scrollToBottom('smooth');
    } else {
      setNewCount((n) => n + added);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, loading, atBottom, user?._id]);

  // ---------- send / optimistic ----------
  function armFailTimer(tempId: string) {
    const t = setTimeout(() => {
      pendingTimers.current.delete(tempId);
      setMessages((prev) => prev.map((m) => (m._id === tempId ? { ...m, pending: false, failed: true } : m)));
    }, SEND_TIMEOUT_MS);
    pendingTimers.current.set(tempId, t);
  }

  function emitSend(payload: { text: string; attachments?: Attachment[]; replyTo?: string }, tempId: string) {
    if (!socket) return;
    socket.emit('sendChannelMessage', { channelId, ...payload });
    socket.emit('channelStopTyping', channelId);
    armFailTimer(tempId);
  }

  function handleSend(text: string, attachments?: Attachment[], replyTo?: string) {
    if (!socket || !user) return;
    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const optimistic: ChannelMessage = {
      _id: tempId,
      channel: channelId,
      sender: user,
      text,
      attachments,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    emitSend({ text, attachments, replyTo }, tempId);
  }

  function handleRetry(message: ChannelMessage) {
    if (!message.failed) return;
    setMessages((prev) => prev.map((m) => (m._id === message._id ? { ...m, failed: false, pending: true } : m)));
    emitSend({ text: message.text, attachments: message.attachments }, message._id);
  }

  function handleTyping() {
    socket?.emit('channelTyping', channelId);
  }

  function handleStopTyping() {
    socket?.emit('channelStopTyping', channelId);
  }

  const isPlaceholder = (id: string) => id.startsWith('tmp_');

  function handleReact(message: ChannelMessage, emoji: string) {
    if (isPlaceholder(message._id)) return;
    socket?.emit('reactToChannelMessage', { messageId: message._id, emoji });
  }

  function handleSubmitEdit(messageId: string, text: string) {
    if (isPlaceholder(messageId)) return;
    socket?.emit('editChannelMessage', { messageId, text });
    setEditingMessage(null);
  }

  function handleDelete(message: ChannelMessage, forEveryone: boolean) {
    if (isPlaceholder(message._id)) {
      const t = pendingTimers.current.get(message._id);
      if (t) clearTimeout(t);
      pendingTimers.current.delete(message._id);
      setMessages((prev) => prev.filter((m) => m._id !== message._id));
      return;
    }
    socket?.emit('deleteChannelMessage', { messageId: message._id, forEveryone });
  }

  async function handleToggleStar(message: ChannelMessage) {
    if (isPlaceholder(message._id) || !user) return;
    const starred = message.starredBy?.includes(user._id);
    const updated = starred
      ? await api.delete<ChannelMessage>(`/groups/channels/messages/${message._id}/star`)
      : await api.post<ChannelMessage>(`/groups/channels/messages/${message._id}/star`);
    setMessages((prev) => prev.map((m) => (m._id === updated._id ? updated : m)));
  }

  function jumpToReply(messageId: string) {
    const el = messageRefs.current[messageId];
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (el) {
      el.classList.add('ring-2', 'ring-accent', 'rounded-2xl');
      setTimeout(() => el.classList.remove('ring-2', 'ring-accent', 'rounded-2xl'), 1200);
    }
  }

  if (!user) return null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-border bg-surface px-4 py-3.5">
        <button
          onClick={openDrawer}
          title="عرض القنوات"
          aria-label="عرض القنوات"
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground md:hidden"
        >
          <PanelRight className="h-5 w-5" />
        </button>
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'إظهار الشريط الجانبي' : 'إخفاء الشريط الجانبي'}
          aria-label={collapsed ? 'إظهار الشريط الجانبي' : 'إخفاء الشريط الجانبي'}
          className="hidden rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground md:block"
        >
          {collapsed ? <PanelRightOpen className="h-5 w-5" /> : <PanelRightClose className="h-5 w-5" />}
        </button>
        {group?.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={group.photoUrl} alt="" className="h-9 w-9 shrink-0 rounded-xl object-cover" />
        ) : (
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-accent text-sm font-bold text-white">
            {group?.name.trim().slice(0, 1) || <Hash className="h-4 w-4" />}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 truncate text-sm font-semibold text-foreground">
            <Hash className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{channel?.name ?? 'جارٍ التحميل…'}</span>
          </p>
          {typing ? (
            <p className="animate-fade-in text-xs text-accent">يكتب أحدهم الآن…</p>
          ) : group ? (
            <p className="truncate text-xs text-muted-foreground">{group.name}</p>
          ) : null}
        </div>
        <button
          onClick={() => setInfoOpen(true)}
          title="معلومات المجموعة"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-accent"
        >
          <Info className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-surface-2 px-4 py-5 scrollbar-thin sm:px-6"
        >
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Spinner className="h-6 w-6" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3.5 text-center">
              <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-accent-100 to-accent-50 text-accent shadow-elev-1 ring-1 ring-inset ring-accent-200/60">
                <Hash className="h-7 w-7" />
              </div>
              <div className="space-y-1">
                <p className="text-[15px] font-semibold text-foreground">
                  # {channel?.name ?? 'القناة'}
                </p>
                <p className="mx-auto max-w-xs text-sm leading-relaxed text-muted-foreground">
                  هذه بداية قناة <span className="font-medium text-foreground">{channel?.name}</span> في {group?.name ?? 'المجموعة'}. كن أول من يكتب رسالة 👋
                </p>
              </div>
            </div>
          ) : (
            messages.map((message, index) => {
              const prev = messages[index - 1];
              const isOwn = message.sender?._id === user._id;
              const showAvatar = !prev || prev.sender?._id !== message.sender?._id;
              return (
                <div
                  key={message._id}
                  ref={(el) => {
                    messageRefs.current[message._id] = el;
                  }}
                  className="transition-all"
                >
                  <ChannelMessageBubble
                    message={message}
                    isOwn={isOwn}
                    showAvatar={showAvatar}
                    currentUserId={user._id}
                    onReply={setReplyingTo}
                    onEdit={setEditingMessage}
                    onDelete={handleDelete}
                    onReact={handleReact}
                    onToggleStar={handleToggleStar}
                    onJumpToReply={jumpToReply}
                    onRetry={handleRetry}
                    onImageClick={(url, name, msg) => setImagePreview({ url, name, message: msg, isOwn })}
                  />
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
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

      <ChannelMessageInput
        onSend={handleSend}
        onTyping={handleTyping}
        onStopTyping={handleStopTyping}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        editingMessage={editingMessage}
        onCancelEdit={() => setEditingMessage(null)}
        onSubmitEdit={handleSubmitEdit}
      />

      <ChannelInfoPanel open={infoOpen} onClose={() => setInfoOpen(false)} groupId={groupId} channelId={channelId} />

      {imagePreview && (
        <ImagePreviewModal
          src={imagePreview.url}
          alt={imagePreview.name}
          onClose={() => setImagePreview(null)}
          message={imagePreview.message}
          isOwn={imagePreview.isOwn}
          onReply={setReplyingTo}
          onReact={handleReact}
          onToggleStar={handleToggleStar}
          onEdit={setEditingMessage}
          onDelete={handleDelete}
          currentUserId={user._id}
        />
      )}
    </div>
  );
}
