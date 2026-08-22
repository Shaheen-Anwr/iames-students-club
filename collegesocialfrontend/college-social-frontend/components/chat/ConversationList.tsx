'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Archive, BellOff, MessageSquarePlus, Pin, Search, Star, Users, UsersRound } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Spinner } from '@/components/ui/Spinner';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { conversationAvatarUser, conversationTitle, isArchived, isMuted, isPinned } from '@/lib/chat-helpers';
import { assetUrl, cn, timeAgo } from '@/lib/utils';
import { useChat } from './ChatProvider';
import { NewChatModal } from './NewChatModal';
import { NewGroupChatModal } from './NewGroupChatModal';
import { SwipeableRow } from './SwipeableRow';
import { CreateOrJoinGroupModal } from '@/components/groups/CreateOrJoinGroupModal';

type Filter = 'all' | 'unread' | 'groups';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'unread', label: 'غير مقروءة' },
  { key: 'groups', label: 'المجموعات' },
];

export function ConversationList() {
  const { user } = useAuth();
  const { conversations, loading, refresh, typingConversationIds } = useChat();
  const { showToast } = useToast();
  const pathname = usePathname();
  const [modalOpen, setModalOpen] = useState(false);
  const [groupChatModalOpen, setGroupChatModalOpen] = useState(false);
  const [studyGroupModalOpen, setStudyGroupModalOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const { pinned, regular, archived, unreadCount, groupsCount } = useMemo(() => {
    if (!user) return { pinned: [], regular: [], archived: [], unreadCount: 0, groupsCount: 0 };
    const active = conversations.filter((c) => !isArchived(c, user._id));
    const matchesFilter = (c: (typeof active)[number]) =>
      filter === 'unread' ? (c.unreadCount ?? 0) > 0 : filter === 'groups' ? c.isGroup : true;
    const filtered = active.filter(matchesFilter);
    return {
      pinned: filtered.filter((c) => isPinned(c, user._id)),
      regular: filtered.filter((c) => !isPinned(c, user._id)),
      archived: conversations.filter((c) => isArchived(c, user._id)),
      unreadCount: active.filter((c) => (c.unreadCount ?? 0) > 0).length,
      groupsCount: active.filter((c) => c.isGroup).length,
    };
  }, [conversations, user, filter]);

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
      <div className="flex items-center justify-between border-b border-border px-4 py-4">
        <h1 className="text-lg font-semibold text-foreground">الدردشات</h1>
        <div className="flex items-center gap-1.5">
          <Link
            href="/chat/starred"
            title="الرسائل المميزة"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-transform hover:scale-110 hover:bg-surface-2 hover:text-foreground active:scale-95"
          >
            <Star className="h-4 w-4" />
          </Link>
          <button
            onClick={() => setStudyGroupModalOpen(true)}
            title="مجموعة دراسية جديدة"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-transform hover:scale-110 hover:bg-surface-2 hover:text-foreground active:scale-95"
          >
            <Users className="h-4 w-4" />
          </button>
          <button
            onClick={() => setGroupChatModalOpen(true)}
            title="محادثة جماعية جديدة"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-transform hover:scale-110 hover:bg-surface-2 hover:text-foreground active:scale-95"
          >
            <UsersRound className="h-4 w-4" />
          </button>
          <button
            onClick={() => setModalOpen(true)}
            title="محادثة جديدة"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-accent text-white shadow-soft transition-transform hover:scale-110 hover:shadow-glow active:scale-95"
          >
            <MessageSquarePlus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {archived.length > 0 && (
        <button
          onClick={() => setShowArchived((v) => !v)}
          className={cn(
            'flex items-center gap-2.5 border-b border-border px-4 py-3 text-sm transition-colors hover:bg-surface-2',
            showArchived && 'bg-accent/10',
          )}
        >
          <Archive className="h-4 w-4 text-muted-foreground" />
          <span className="flex-1 text-start text-foreground">{showArchived ? 'رجوع للدردشات' : `الأرشيف (${archived.length})`}</span>
        </button>
      )}

      {!showArchived && (
        <div className="flex items-center gap-2 overflow-x-auto border-b border-border px-4 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTERS.map((f) => {
            const count = f.key === 'unread' ? unreadCount : f.key === 'groups' ? groupsCount : 0;
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  'shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all',
                  active ? 'bg-gradient-accent text-white shadow-soft' : 'bg-surface-2 text-muted-foreground hover:text-foreground',
                )}
              >
                {f.label}
                {count > 0 && <span className="ms-1 opacity-80">{count}</span>}
              </button>
            );
          })}
        </div>
      )}

      <div
        className="min-h-0 flex-1 overflow-y-auto scrollbar-thin"
        style={{
          backgroundImage: 'radial-gradient(rgb(var(--accent) / 0.07) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      >
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner className="h-5 w-5" />
          </div>
        ) : list.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2/70">
              <Search className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              {showArchived
                ? 'لا توجد محادثات مؤرشفة.'
                : filter === 'unread'
                  ? 'لا توجد محادثات غير مقروءة.'
                  : filter === 'groups'
                    ? 'لا توجد مجموعات بعد.'
                    : 'لا توجد محادثات بعد. ابدأ واحدة باستخدام الزر أعلاه.'}
            </p>
          </div>
        ) : (
          list.map((conversation) => {
            const title = conversationTitle(conversation, user._id);
            const avatarUser = conversationAvatarUser(conversation, user._id);
            const href = `/chat/${conversation._id}`;
            const active = pathname === href;
            const muted = isMuted(conversation, user._id);
            const pinnedFlag = isPinned(conversation, user._id);
            const unread = conversation.unreadCount ?? 0;
            const isTyping = typingConversationIds.has(conversation._id);
            const online = !conversation.isGroup && !!avatarUser?.isOnline;

            return (
              <SwipeableRow
                key={conversation._id}
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
                    onClick: () =>
                      runAction(() =>
                        muted
                          ? api.delete(`/chat/conversations/${conversation._id}/mute`)
                          : api.post(`/chat/conversations/${conversation._id}/mute`, {}),
                      ),
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
                  className={cn(
                    'flex items-center gap-3 border-b border-border bg-surface px-4 py-3.5 transition-colors hover:bg-surface-2',
                    active && 'bg-accent/10 hover:bg-accent/10',
                  )}
                >
                  <Avatar src={assetUrl(conversation.groupIcon ?? avatarUser?.photoUrl)} name={title} size="lg" online={online} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex min-w-0 items-center gap-1 truncate text-sm font-semibold text-foreground">
                        {pinnedFlag && <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />}
                        <span className="truncate">{title}</span>
                      </p>
                      {conversation.lastMessageAt && (
                        <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(conversation.lastMessageAt)}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p
                        className={cn(
                          'truncate text-xs',
                          isTyping ? 'font-medium text-accent' : 'text-muted-foreground',
                        )}
                      >
                        {isTyping ? 'يكتب الآن...' : conversation.lastMessagePreview || 'قل مرحبًا 👋'}
                      </p>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {muted && <BellOff className="h-3 w-3 text-muted-foreground" />}
                        {unread > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">
                            {unread > 99 ? '99+' : unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              </SwipeableRow>
            );
          })
        )}
      </div>

      <NewChatModal open={modalOpen} onClose={() => setModalOpen(false)} />
      <NewGroupChatModal open={groupChatModalOpen} onClose={() => setGroupChatModalOpen(false)} />
      <CreateOrJoinGroupModal open={studyGroupModalOpen} onClose={() => setStudyGroupModalOpen(false)} />
    </div>
  );
}
