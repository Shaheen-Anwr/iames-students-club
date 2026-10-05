'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Archive, BellOff, Loader2, MessageSquarePlus, Pin, Search, Star, Users, UsersRound, X } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadError } from '@/components/ui/LoadError';
import { Skeleton } from '@/components/ui/Skeleton';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { chatApi } from '@/lib/chat-api';
import { useChatDrafts } from '@/lib/chat-drafts';
import { stripFormatting } from '@/lib/chat-format';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import {
  conversationAvatarUser,
  conversationTitle,
  formatFullDate,
  formatListTime,
  isArchived,
  isMuted,
  isPinned,
  lastSenderPrefix,
  stripMentionTokens,
} from '@/lib/chat-helpers';
import { assetUrl, cn } from '@/lib/utils';
import type { Conversation, Message } from '@/lib/types';
import { useChat } from './ChatProvider';
import { NewChatModal } from './NewChatModal';
import { NewGroupChatModal } from './NewGroupChatModal';
import { SwipeableRow } from './SwipeableRow';
import { TypingDots } from './ChatChrome';
import { CreateOrJoinGroupModal } from '@/components/groups/CreateOrJoinGroupModal';

type Filter = 'all' | 'unread' | 'groups' | 'public';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'unread', label: 'غير مقروءة' },
  { key: 'groups', label: 'المجموعات' },
  { key: 'public', label: 'عامة' },
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Plain-text snippet with the query marked (search hits). No linkification -- the whole row is a link.
function Highlighted({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-sm bg-amber-300/70 px-0.5 text-inherit dark:bg-amber-400/50">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

// The snippet around the first match, so a hit deep in a long message is still visible.
function snippetAround(text: string, query: string, radius = 48): string {
  const clean = stripMentionTokens(text).replace(/\s+/g, ' ');
  const at = clean.toLowerCase().indexOf(query.trim().toLowerCase());
  if (at <= radius) return clean.slice(0, radius * 2 + query.length);
  return `…${clean.slice(at - radius, at + query.length + radius)}`;
}

export function ConversationList() {
  const { user } = useAuth();
  const { conversations, loading, error, refresh, typingConversationIds } = useChat();
  const { showToast } = useToast();
  const pathname = usePathname();
  const drafts = useChatDrafts();
  const [modalOpen, setModalOpen] = useState(false);
  const [groupChatModalOpen, setGroupChatModalOpen] = useState(false);
  const [studyGroupModalOpen, setStudyGroupModalOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query.trim(), 350);
  const [messageHits, setMessageHits] = useState<Message[]>([]);
  const [hitsLoading, setHitsLoading] = useState(false);
  const searching = query.trim().length > 0;

  // Message search across every conversation (backend), once the query is meaningful.
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setMessageHits([]);
      setHitsLoading(false);
      return;
    }
    let cancelled = false;
    setHitsLoading(true);
    chatApi
      .searchAll(debouncedQuery)
      .then((hits) => !cancelled && setMessageHits(hits))
      .catch(() => !cancelled && setMessageHits([]))
      .finally(() => !cancelled && setHitsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const byId = useMemo(() => new Map(conversations.map((c) => [c._id, c])), [conversations]);

  const { pinned, regular, archived, unreadCount, groupsCount, publicCount } = useMemo(() => {
    if (!user) return { pinned: [], regular: [], archived: [], unreadCount: 0, groupsCount: 0, publicCount: 0 };
    const q = query.trim().toLowerCase();
    const matchesQuery = (c: Conversation) => {
      if (!q) return true;
      if (conversationTitle(c, user._id).toLowerCase().includes(q)) return true;
      if (c.isGroup && c.participants.some((p) => p?.name?.toLowerCase().includes(q))) return true;
      return !!c.lastMessagePreview?.toLowerCase().includes(q);
    };
    const active = conversations.filter((c) => !isArchived(c, user._id));
    const isPublicGroup = (c: Conversation) => c.isGroup && c.visibility === 'public';
    const matchesFilter = (c: Conversation) =>
      filter === 'unread' ? (c.unreadCount ?? 0) > 0 : filter === 'groups' ? c.isGroup : filter === 'public' ? isPublicGroup(c) : true;
    const filtered = active.filter((c) => matchesFilter(c) && matchesQuery(c));
    return {
      pinned: filtered.filter((c) => isPinned(c, user._id)),
      regular: filtered.filter((c) => !isPinned(c, user._id)),
      archived: conversations.filter((c) => isArchived(c, user._id) && matchesQuery(c)),
      unreadCount: active.filter((c) => (c.unreadCount ?? 0) > 0).length,
      groupsCount: active.filter((c) => c.isGroup).length,
      publicCount: active.filter(isPublicGroup).length,
    };
  }, [conversations, user, filter, query]);

  if (!user) return null;

  const list = showArchived ? archived : [...pinned, ...regular];

  async function runAction(action: () => Promise<unknown>) {
    try {
      await action();
      await refresh();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر تنفيذ الإجراء.', 'error');
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <h1 className="text-xl font-bold tracking-tight text-foreground">الدردشات</h1>
        <div className="flex items-center gap-1">
          <Link
            href="/chat/starred"
            title="الرسائل المميزة"
            aria-label="الرسائل المميزة"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-surface-2 hover:text-foreground active:scale-95"
          >
            <Star className="h-[18px] w-[18px]" />
          </Link>
          <button
            type="button"
            onClick={() => setStudyGroupModalOpen(true)}
            title="مجموعة دراسية جديدة"
            aria-label="مجموعة دراسية جديدة"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-surface-2 hover:text-foreground active:scale-95"
          >
            <Users className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => setGroupChatModalOpen(true)}
            title="محادثة جماعية جديدة"
            aria-label="محادثة جماعية جديدة"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-surface-2 hover:text-foreground active:scale-95"
          >
            <UsersRound className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            title="محادثة جديدة"
            aria-label="محادثة جديدة"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-accent text-white shadow-elev-1 transition-all hover:shadow-glow active:scale-95"
          >
            <MessageSquarePlus className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>

      {/* Search: chats by name/member/preview + messages across every chat */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            placeholder="ابحث في المحادثات والرسائل"
            aria-label="بحث في المحادثات والرسائل"
            className="h-10 w-full rounded-full bg-surface-2/80 pe-9 ps-10 text-sm text-foreground ring-1 ring-border/50 transition-shadow placeholder:text-muted-foreground focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          {searching && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="مسح البحث"
              className="absolute end-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-3"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {archived.length > 0 && !searching && (
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className={cn(
            'mx-2 mb-1 flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-surface-2',
            showArchived && 'bg-accent/10',
          )}
        >
          <Archive className="h-4 w-4 text-muted-foreground" />
          <span className="flex-1 text-start text-foreground">{showArchived ? 'رجوع للدردشات' : 'الأرشيف'}</span>
          {!showArchived && <span className="text-xs font-medium text-muted-foreground">{archived.length}</span>}
        </button>
      )}

      {!showArchived && !searching && (
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border/60 px-3 pb-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTERS.map((f) => {
            const count = f.key === 'unread' ? unreadCount : f.key === 'groups' ? groupsCount : f.key === 'public' ? publicCount : 0;
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(f.key)}
                className={cn(
                  'relative min-h-8 shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                  active ? 'text-white' : 'bg-surface-2 text-muted-foreground hover:bg-surface-3 hover:text-foreground',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="chat-filter-pill"
                    className="absolute inset-0 rounded-full bg-gradient-accent shadow-elev-1"
                    transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                  />
                )}
                <span className="relative">
                  {f.label}
                  {count > 0 && (
                    <span className={cn('ms-1.5 inline-flex min-w-5 items-center justify-center rounded-full px-1 text-[11px]', active ? 'bg-white/20' : 'bg-surface text-foreground')}>
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl p-2.5">
                <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-2/5" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : error && list.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <LoadError title="تعذّر تحميل المحادثات" onRetry={() => void refresh()} />
          </div>
        ) : (
          <>
            {searching && (list.length > 0 || messageHits.length > 0 || hitsLoading) && (
              <p className="px-4 pb-1 pt-3 text-xs font-semibold text-muted-foreground">المحادثات</p>
            )}

            {list.length === 0 && !searching ? (
              <div className="flex h-full items-center justify-center">
                <EmptyState
                  icon={Search}
                  title={
                    showArchived
                      ? 'لا توجد محادثات مؤرشفة'
                      : filter === 'unread'
                        ? 'لا توجد محادثات غير مقروءة'
                        : filter === 'groups'
                          ? 'لا توجد مجموعات بعد'
                          : filter === 'public'
                            ? 'لا توجد مجموعات عامة بعد'
                            : 'لا توجد محادثات بعد'
                  }
                  description={!showArchived && filter === 'all' ? 'ابدأ واحدة باستخدام الزر أعلاه.' : undefined}
                />
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {list.map((conversation) => {
                  const title = conversationTitle(conversation, user._id);
                  const avatarUser = conversationAvatarUser(conversation, user._id);
                  const href = `/chat/${conversation._id}`;
                  const active = pathname === href;
                  const muted = isMuted(conversation, user._id);
                  const pinnedFlag = isPinned(conversation, user._id);
                  const unread = conversation.unreadCount ?? 0;
                  const isTyping = typingConversationIds.has(conversation._id);
                  const online = !conversation.isGroup && !!avatarUser?.isOnline;
                  const draft = !active ? drafts[conversation._id]?.text : undefined;
                  const prefix = lastSenderPrefix(conversation, user._id);
                  const preview = conversation.lastMessagePreview
                    ? stripFormatting(stripMentionTokens(conversation.lastMessagePreview))
                    : '';

                  return (
                    <motion.div
                      key={conversation._id}
                      layout="position"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ layout: { type: 'spring', stiffness: 520, damping: 42 }, opacity: { duration: 0.15 } }}
                    >
                      <SwipeableRow
                        actions={[
                          {
                            key: 'pin',
                            icon: <Pin className="h-4 w-4" />,
                            label: pinnedFlag ? 'إلغاء التثبيت' : 'تثبيت',
                            active: pinnedFlag,
                            onClick: () => runAction(() => api.post(`/chat/conversations/${conversation._id}/pin`)),
                          },
                          {
                            key: 'mute',
                            icon: <BellOff className="h-4 w-4" />,
                            label: muted ? 'إلغاء الكتم' : 'كتم',
                            active: muted,
                            onClick: () => runAction(() => chatApi.markMuted(conversation._id, !muted)),
                          },
                          {
                            key: 'archive',
                            icon: <Archive className="h-4 w-4" />,
                            label: showArchived ? 'إلغاء الأرشفة' : 'أرشفة',
                            active: showArchived,
                            onClick: () => runAction(() => api.post(`/chat/conversations/${conversation._id}/archive`)),
                          },
                        ]}
                      >
                        <Link
                          href={href}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'relative mx-1.5 my-0.5 flex min-h-[72px] items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-surface-2/80',
                            active &&
                              'bg-accent/10 hover:bg-accent/10 before:absolute before:inset-y-3 before:start-0 before:w-1 before:rounded-full before:bg-accent',
                          )}
                        >
                          <Avatar src={assetUrl(conversation.groupIcon ?? avatarUser?.photoUrl)} name={title} size="lg" online={online} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className={cn('flex min-w-0 items-center gap-1 text-[15px] text-foreground', unread > 0 ? 'font-bold' : 'font-semibold')}>
                                <span dir="auto" className="truncate">
                                  {title}
                                </span>
                                {conversation.visibility === 'public' && (
                                  <span className="shrink-0 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">عامة</span>
                                )}
                              </p>
                              {conversation.lastMessageAt && (
                                <time
                                  dateTime={conversation.lastMessageAt}
                                  title={formatFullDate(conversation.lastMessageAt)}
                                  className={cn('shrink-0 text-xs tabular-nums', unread > 0 ? 'font-semibold text-accent' : 'text-muted-foreground')}
                                >
                                  {formatListTime(conversation.lastMessageAt)}
                                </time>
                              )}
                            </div>
                            <div className="mt-0.5 flex items-center justify-between gap-2">
                              <p className={cn('min-w-0 flex-1 truncate text-sm', unread > 0 ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                                {isTyping ? (
                                  <span className="inline-flex items-center gap-1.5 font-semibold text-accent">
                                    <TypingDots /> يكتب الآن…
                                  </span>
                                ) : draft?.trim() ? (
                                  <>
                                    <span className="font-semibold text-danger">مسودة: </span>
                                    <span dir="auto">{stripMentionTokens(draft)}</span>
                                  </>
                                ) : (
                                  <>
                                    {prefix && preview && <span className="text-foreground/70">{prefix}: </span>}
                                    <span dir="auto">{preview || 'قل مرحبًا 👋'}</span>
                                  </>
                                )}
                              </p>
                              <div className="flex shrink-0 items-center gap-1.5">
                                {muted && <BellOff className="h-3.5 w-3.5 text-muted-foreground" aria-label="مكتومة" />}
                                {pinnedFlag && <Pin className="h-3.5 w-3.5 text-muted-foreground" aria-label="مثبّتة" />}
                                <AnimatePresence>
                                  {unread > 0 && (
                                    <motion.span
                                      initial={{ scale: 0 }}
                                      animate={{ scale: 1 }}
                                      exit={{ scale: 0 }}
                                      transition={{ type: 'spring', stiffness: 600, damping: 24 }}
                                      aria-label={`${unread} رسائل غير مقروءة`}
                                      className={cn(
                                        'flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white shadow-sm',
                                        muted ? 'bg-muted-foreground/60' : 'bg-gradient-accent',
                                      )}
                                    >
                                      {unread > 99 ? '99+' : unread}
                                    </motion.span>
                                  )}
                                </AnimatePresence>
                              </div>
                            </div>
                          </div>
                        </Link>
                      </SwipeableRow>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}

            {searching && (
              <>
                <p className="flex items-center gap-2 px-4 pb-1 pt-4 text-xs font-semibold text-muted-foreground">
                  الرسائل {hitsLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                </p>
                {query.trim().length < 2 ? (
                  <p className="px-4 py-2 text-xs text-muted-foreground">اكتب حرفين على الأقل للبحث في الرسائل.</p>
                ) : !hitsLoading && messageHits.length === 0 ? (
                  <p className="px-4 py-2 text-xs text-muted-foreground">لا توجد رسائل مطابقة.</p>
                ) : (
                  messageHits.map((hit) => {
                    const conversation = byId.get(hit.conversation);
                    if (!conversation) return null;
                    const title = conversationTitle(conversation, user._id);
                    const avatarUser = conversationAvatarUser(conversation, user._id);
                    const from = hit.sender?._id === user._id ? 'أنت' : hit.sender?.name;
                    return (
                      <Link
                        key={hit._id}
                        href={`/chat/${hit.conversation}?m=${hit._id}&t=${encodeURIComponent(hit.createdAt)}`}
                        onClick={() => setQuery('')}
                        className="mx-1.5 my-0.5 flex items-start gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-surface-2/80"
                      >
                        <Avatar src={assetUrl(conversation.groupIcon ?? avatarUser?.photoUrl)} name={title} size="md" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p dir="auto" className="truncate text-sm font-semibold text-foreground">
                              {title}
                            </p>
                            <time className="shrink-0 text-[11px] text-muted-foreground" title={formatFullDate(hit.createdAt)}>
                              {formatListTime(hit.createdAt)}
                            </time>
                          </div>
                          <p dir="auto" className="line-clamp-2 text-[13px] leading-snug text-muted-foreground">
                            {from && conversation.isGroup && <span className="text-foreground/70">{from}: </span>}
                            <Highlighted text={snippetAround(hit.text || hit.poll?.question || '', query)} query={query} />
                          </p>
                        </div>
                      </Link>
                    );
                  })
                )}
              </>
            )}
          </>
        )}
      </div>

      <NewChatModal open={modalOpen} onClose={() => setModalOpen(false)} />
      <NewGroupChatModal open={groupChatModalOpen} onClose={() => setGroupChatModalOpen(false)} />
      <CreateOrJoinGroupModal open={studyGroupModalOpen} onClose={() => setStudyGroupModalOpen(false)} />
    </div>
  );
}
