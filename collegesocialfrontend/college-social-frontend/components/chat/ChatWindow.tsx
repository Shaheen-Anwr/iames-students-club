'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Image as ImageIcon,
  MessageCircle,
  Phone,
  Search,
  ShieldOff,
  Video,
  X,
  Reply,
  SmilePlus,
  Forward,
  Star,
  Pencil,
  Trash2,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { RoleBadge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useSocket } from '@/lib/socket-context';
import { conversationAvatarUser, conversationTitle, presenceLabel } from '@/lib/chat-helpers';
import { assetUrl } from '@/lib/utils';
import { cldOptimize } from '@/lib/images';
import { chatBackgroundStyle, useChatBackground } from '@/lib/chat-background';
import type { Attachment, Message, User, Conversation } from '@/lib/types';
import { useChat } from './ChatProvider';
import { useCall } from './CallProvider';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { ForwardModal } from './ForwardModal';
import { GroupInfoPanel } from './GroupInfoPanel';
import { ChatBackgroundModal } from './ChatBackgroundModal';
import { QuickReactionBar } from './EmojiPicker';

let typingTimeout: ReturnType<typeof setTimeout> | null = null;

// ========== LIGHTBOX WITH ACTIONS ==========
function ImagePreviewModal({
  src,
  alt,
  onClose,
  message,
  isOwn,
  onReply,
  onReact,
  onForward,
  onToggleStar,
  onEdit,
  onDelete,
  currentUserId,
}: {
  src: string;
  alt: string;
  onClose: () => void;
  message: Message;
  isOwn: boolean;
  onReply: (msg: Message) => void;
  onReact: (msg: Message, emoji: string) => void;
  onForward: (msg: Message) => void;
  onToggleStar: (msg: Message) => void;
  onEdit: (msg: Message) => void;
  onDelete: (msg: Message, forEveryone: boolean) => void;
  currentUserId: string;
}) {
  const [reactionBarOpen, setReactionBarOpen] = useState(false);
  const [deleteOptionsOpen, setDeleteOptionsOpen] = useState(false);
  const isStarred = message.starredBy?.includes(currentUserId);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        setDeleteOptionsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-black/90 p-4"
      onClick={() => {
        onClose();
        setDeleteOptionsOpen(false);
      }}
      role="dialog"
      aria-modal="true"
      aria-label="معاينة الصورة"
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
        aria-label="إغلاق"
      >
        <X className="h-6 w-6" />
      </button>

      {/* Image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cldOptimize(src, { width: 1600, crop: 'limit' })}
        alt={alt}
        className="max-h-[70vh] w-full flex-1 object-contain"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Action bar */}
      <div
        className="mt-4 flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-surface p-3 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Reply */}
        <button
          onClick={() => {
            onReply(message);
            onClose();
          }}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-foreground hover:bg-accent hover:text-white"
          title="رد"
        >
          <Reply className="h-5 w-5" />
        </button>

        {/* React */}
        <div className="relative">
          <button
            onClick={() => setReactionBarOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-foreground hover:bg-accent hover:text-white"
            title="تفاعل"
          >
            <SmilePlus className="h-5 w-5" />
          </button>
          <QuickReactionBar
            open={reactionBarOpen}
            onClose={() => setReactionBarOpen(false)}
            onSelect={(emoji) => {
              onReact(message, emoji);
              setReactionBarOpen(false);
            }}
            onOpenFullPicker={() => setReactionBarOpen(false)}
            align="start"
          />
        </div>

        {/* Forward */}
        <button
          onClick={() => {
            onForward(message);
            onClose();
          }}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-foreground hover:bg-accent hover:text-white"
          title="إعادة توجيه"
        >
          <Forward className="h-5 w-5" />
        </button>

        {/* Star */}
        <button
          onClick={() => onToggleStar(message)}
          className={`flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 hover:bg-accent hover:text-white ${
            isStarred ? 'text-yellow-400' : 'text-foreground'
          }`}
          title={isStarred ? 'إلغاء التمييز' : 'تمييز بنجمة'}
        >
          <Star className="h-5 w-5" />
        </button>

        {/* Edit (only if own and has text) */}
        {isOwn && message.text && (
          <button
            onClick={() => {
              onEdit(message);
              onClose();
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-foreground hover:bg-accent hover:text-white"
            title="تعديل"
          >
            <Pencil className="h-5 w-5" />
          </button>
        )}

        {/* Delete – single button with options */}
        {isOwn && (
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDeleteOptionsOpen((v) => !v);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-danger hover:bg-danger hover:text-white"
              title="حذف"
            >
              <Trash2 className="h-5 w-5" />
            </button>
            {deleteOptionsOpen && (
              <div
                className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-xl bg-surface p-2 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => {
                    onDelete(message, true);
                    onClose();
                    setDeleteOptionsOpen(false);
                  }}
                  className="block w-full whitespace-nowrap rounded-lg px-4 py-2 text-sm text-danger hover:bg-danger/10"
                >
                  حذف لدى الجميع
                </button>
                <button
                  onClick={() => {
                    onDelete(message, false);
                    onClose();
                    setDeleteOptionsOpen(false);
                  }}
                  className="block w-full whitespace-nowrap rounded-lg px-4 py-2 text-sm text-foreground hover:bg-surface-2"
                >
                  حذف لديّ
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ChatWindow({ conversationId }: { conversationId: string }) {
  const { user, updateLocalUser } = useAuth();
  const { socket } = useSocket();
  const { findConversation, refresh } = useChat();
  const { startCall } = useCall();
  const conversation = findConversation(conversationId);

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
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
  const { background, setBackground } = useChatBackground(conversationId);

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

  // ========== LOAD MESSAGES ==========
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get<Message[]>(`/chat/conversations/${conversationId}/messages?limit=50`).then((data) => {
      if (cancelled) return;
      const corrected = data.map((msg) => {
        if (!conversation) return msg;
        return correctSenderPhoto(msg, conversation);
      });
      setMessages(corrected.reverse());
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId, conversation]);

  // ========== SOCKET EVENTS ==========
  useEffect(() => {
    if (!socket || !conversation) return;
    socket.emit('joinConversation', conversationId);
    socket.emit('markRead', conversationId);
    socket.emit('markDelivered', conversationId);

    const onNewMessage = (message: Message) => {
      if (message.conversation !== conversationId) return;
      const corrected = correctSenderPhoto(message, conversation);
      setMessages((prev) =>
        prev.some((m) => m._id === corrected._id) ? prev : [...prev, corrected]
      );
      if (corrected.sender?._id !== user?._id) {
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

  // ========== SCROLL TO BOTTOM ==========
  useEffect(() => {
    if (!searchOpen) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, searchOpen]);

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
  function handleSend(text: string, attachments?: Attachment[], replyTo?: string) {
    if (!socket) return;
    socket.emit('sendMessage', { conversationId, text, attachments, replyTo });
    socket.emit('stopTyping', conversationId);
  }

  function handleTyping() {
    socket?.emit('typing', conversationId);
  }

  function handleStopTyping() {
    socket?.emit('stopTyping', conversationId);
  }

  function handleReact(message: Message, emoji: string) {
    socket?.emit('reactToMessage', { messageId: message._id, emoji });
  }

  function handleSubmitEdit(messageId: string, text: string) {
    socket?.emit('editMessage', { messageId, text });
    setEditingMessage(null);
  }

  async function handleDelete(message: Message, forEveryone: boolean) {
    socket?.emit('deleteMessage', { messageId: message._id, forEveryone });
  }

  async function handleForwardConfirm(conversationIds: string[]) {
    if (!forwardTarget) return;
    socket?.emit('forwardMessage', { messageId: forwardTarget._id, conversationIds });
    setForwardTarget(null);
  }

  async function handleToggleStar(message: Message) {
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

  const title = conversation ? conversationTitle(conversation, user._id) : 'جارٍ التحميل…';
  const avatarUser = conversation ? conversationAvatarUser(conversation, user._id) : undefined;
  const presence = !conversation?.isGroup ? presenceLabel(avatarUser) : null;
  const blockedByMe =
    !conversation?.isGroup && !!avatarUser && !!user.blockedUsers?.includes(avatarUser._id);

  // ========== RENDER ==========
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3.5">
        <Link
          href="/chat"
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground lg:hidden"
        >
          <ArrowRight className="h-5 w-5" />
        </Link>
        <button onClick={() => setInfoOpen(true)} className="flex min-w-0 flex-1 items-center gap-3 text-start">
          <Avatar src={assetUrl(conversation?.groupIcon ?? avatarUser?.photoUrl)} name={title} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground">
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
        {!conversation?.isGroup && (
          <>
            <button
              onClick={() => handleCall('audio')}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-accent"
            >
              <Phone className="h-4 w-4" />
            </button>
            <button
              onClick={() => handleCall('video')}
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
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-accent"
        >
          <Search className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      {searchOpen && (
        <div className="border-b border-border bg-surface px-4 py-2.5">
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
      )}

      {/* Messages */}
      <div
        className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-surface-2 px-4 py-5 scrollbar-thin sm:px-6"
        style={chatBackgroundStyle(background)}
      >
        {loading || !conversation ? (
          <div className="flex h-full items-center justify-center">
            <Spinner className="h-6 w-6" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2/70">
              <MessageCircle className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">لا توجد رسائل بعد</p>
              <p className="mt-1 text-xs text-muted-foreground">قل مرحبًا وابدأ المحادثة 👋</p>
            </div>
          </div>
        ) : (
          messages.map((message, index) => {
            const prev = messages[index - 1];
            const isOwn = message.sender?._id === user._id;
            const showAvatar = !prev || prev.sender?._id !== message.sender?._id;
            return (
              <div key={message._id} ref={(el) => { messageRefs.current[message._id] = el; }} className="transition-all">
                <MessageBubble
                  message={message}
                  isOwn={isOwn}
                  showAvatar={showAvatar}
                  conversation={conversation}
                  currentUserId={user._id}
                  onReply={setReplyingTo}
                  onEdit={setEditingMessage}
                  onDelete={handleDelete}
                  onReact={handleReact}
                  onForward={setForwardTarget}
                  onToggleStar={handleToggleStar}
                  onJumpToReply={jumpToReply}
                  onImageClick={(url, name, msg) => setImagePreview({ url, name, message: msg, isOwn })}
                />
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {blockedByMe ? (
        <div className="flex items-center justify-center gap-2 border-t border-border bg-surface px-4 py-3.5 text-center text-sm text-muted-foreground">
          <ShieldOff className="h-4 w-4 shrink-0" />
          لقد قمت بحظر هذا المستخدم.
          <button onClick={handleUnblock} className="font-medium text-accent hover:underline">
            إلغاء الحظر
          </button>
        </div>
      ) : (
        <MessageInput
          onSend={handleSend}
          onTyping={handleTyping}
          onStopTyping={handleStopTyping}
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