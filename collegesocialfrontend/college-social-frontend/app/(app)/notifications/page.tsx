'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Heart, HelpCircle, MessageCircle, MessageSquareText, Share2, Users, UserPlus, UserCheck } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { api } from '@/lib/api';
import { useNotifications } from '@/lib/notifications-context';
import { assetUrl, cn, timeAgo } from '@/lib/utils';
import type { Notification } from '@/lib/types';

const NOTIFICATION_LABELS: Record<Notification['type'], string> = {
  chat_message: 'أرسل لك رسالة',
  channel_message: 'أرسل رسالة في المجموعة',
  post_comment: 'علّق على منشورك',
  post_reaction: 'تفاعل مع منشورك',
  post_share: 'شارك منشورك',
  comment_reply: 'رد على تعليقك',
  comment_reaction: 'تفاعل مع تعليقك',
  qa_answer: 'أجاب على سؤالك',
  friend_request: 'أرسل لك طلب صداقة',
  friend_accept: 'قبل طلب صداقتك',
};

const NOTIFICATION_ICONS: Record<Notification['type'], React.ComponentType<{ className?: string }>> = {
  chat_message: MessageCircle,
  channel_message: Users,
  post_comment: MessageSquareText,
  post_reaction: Heart,
  post_share: Share2,
  comment_reply: MessageSquareText,
  comment_reaction: Heart,
  qa_answer: HelpCircle,
  friend_request: UserPlus,
  friend_accept: UserCheck,
};

function notificationHref(notification: Notification): string {
  switch (notification.type) {
    case 'chat_message':
      return notification.conversationId ? `/chat/${notification.conversationId}` : '/chat';
    case 'channel_message':
      return notification.groupId && notification.channelId ? `/groups/${notification.groupId}/${notification.channelId}` : '/groups';
    case 'qa_answer':
      return notification.questionId ? `/study/qa/${notification.questionId}` : '/study/qa';
    case 'friend_request':
    case 'friend_accept':
      return notification.actor ? `/profile/${notification.actor._id}` : '/feed';
    // Comment-centric: land on the post with its comments already open.
    case 'post_comment':
    case 'comment_reply':
    case 'comment_reaction':
      return notification.postId ? `/posts/${notification.postId}?comments=1` : '/feed';
    // Post-centric: land on the post itself.
    case 'post_reaction':
    case 'post_share':
      return notification.postId ? `/posts/${notification.postId}` : '/feed';
    default:
      return '/feed';
  }
}

/** Buckets a notification's timestamp into a coarse, human day-label for grouping. */
function dayLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (diffDays <= 0) return 'اليوم';
  if (diffDays === 1) return 'أمس';
  return 'أقدم';
}

export default function NotificationsPage() {
  const router = useRouter();
  const { notifications, loading, markRead, markAllRead } = useNotifications();
  const [extra, setExtra] = useState<Notification[]>([]);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  const items = [...notifications, ...extra];
  const hasUnread = items.some((n) => !n.read);

  const groups = useMemo(() => {
    const map = new Map<string, Notification[]>();
    for (const n of items) {
      const label = dayLabel(n.createdAt);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(n);
    }
    return [...map.entries()];
  }, [items]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const data = await api.get<Notification[]>(`/notifications?page=${nextPage}&limit=20`);
      if (data.length === 0) setExhausted(true);
      setExtra((prev) => [...prev, ...data]);
      setPage(nextPage);
    } finally {
      setLoadingMore(false);
    }
  }

  function handleClick(notification: Notification) {
    if (!notification.read) markRead(notification._id);
    router.push(notificationHref(notification));
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col px-4 py-6">
      <div className="flex items-center justify-between pb-4">
        <h1 className="text-lg font-semibold text-foreground">الإشعارات</h1>
        {hasUnread && (
          <Button variant="ghost" size="sm" onClick={markAllRead}>
            تعليم الكل كمقروء
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner className="h-5 w-5" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2/70">
              <Bell className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">لا توجد إشعارات بعد</p>
              <p className="mt-1 text-xs text-muted-foreground">ستظهر هنا تفاعلات وردود ورسائل زملائك أولًا بأول.</p>
            </div>
          </div>
        ) : (
          <>
            {groups.map(([label, groupItems]) => (
              <div key={label} className="mb-4">
                <p className="px-1 pb-2 text-xs font-semibold text-muted-foreground">{label}</p>
                <div className="space-y-2">
                  {groupItems.map((notification) => {
                    const Icon = NOTIFICATION_ICONS[notification.type];
                    return (
                      <button
                        key={notification._id}
                        onClick={() => handleClick(notification)}
                        className={cn(
                          'flex w-full items-start gap-3.5 rounded-xl2 p-4 text-start transition-colors hover:bg-surface-2/70',
                          !notification.read && 'bg-accent/5',
                        )}
                      >
                        <Avatar src={assetUrl(notification.actor?.photoUrl)} name={notification.actor?.name ?? 'مستخدم'} size="md" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] leading-relaxed text-foreground">
                            <span className="font-semibold">{notification.actor?.name ?? 'مستخدم'}</span>{' '}
                            {NOTIFICATION_LABELS[notification.type]}
                          </p>
                          {notification.preview && (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">{notification.preview}</p>
                          )}
                          <p className="mt-1 text-xs text-muted-foreground">{timeAgo(notification.createdAt)}</p>
                        </div>
                        <div className="mt-0.5 flex shrink-0 flex-col items-center gap-2">
                          {!notification.read && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />}
                          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {!exhausted && (
              <div className="flex justify-center py-4">
                <Button variant="outline" size="sm" onClick={loadMore} loading={loadingMore}>
                  تحميل المزيد
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
