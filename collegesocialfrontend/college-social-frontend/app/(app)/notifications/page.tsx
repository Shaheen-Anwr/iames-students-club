'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Megaphone } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { api } from '@/lib/api';
import { useNotifications } from '@/lib/notifications-context';
import { assetUrl, cn, timeAgo } from '@/lib/utils';
import type { Notification } from '@/lib/types';
import {
  NOTIFICATION_LABELS,
  NOTIFICATION_ICONS,
  notificationHref,
} from '@/components/layout/NotificationBell';

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
  const { notifications, loading, refresh, markRead, markAllRead } = useNotifications();
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

      <PullToRefresh onRefresh={refresh} className="min-h-0 flex-1 scrollbar-thin">
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner className="h-5 w-5" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="لا توجد إشعارات بعد"
            description="ستظهر هنا تفاعلات وردود ورسائل زملائك أولًا بأول."
          />
        ) : (
          <>
            {groups.map(([label, groupItems]) => (
              <div key={label} className="mb-4">
                <p className="px-1 pb-2 text-xs font-semibold text-muted-foreground">{label}</p>
                <div className="space-y-2">
                  {groupItems.map((notification) => {
                    const Icon = NOTIFICATION_ICONS[notification.type];
                    const isSystem = notification.type === 'system_announcement';
                    // Legacy system rows written before the announcement's author was carried.
                    const systemNoActor = isSystem && !notification.actor;
                    return (
                      <button
                        key={notification._id}
                        onClick={() => handleClick(notification)}
                        className={cn(
                          'flex w-full items-start gap-3.5 rounded-xl2 p-4 text-start transition-colors hover:bg-surface-2/70',
                          !notification.read && 'bg-accent/5',
                        )}
                      >
                        {systemNoActor ? (
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                            <Megaphone className="h-5 w-5" />
                          </span>
                        ) : (
                          <Avatar src={assetUrl(notification.actor?.photoUrl)} name={notification.actor?.name ?? 'مستخدم'} size="md" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] leading-relaxed text-foreground">
                            {systemNoActor ? (
                              <span className="font-semibold">{notification.title ?? NOTIFICATION_LABELS.system_announcement}</span>
                            ) : (
                              <>
                                <span className="font-semibold">{notification.actor?.name ?? 'مستخدم'}</span>{' '}
                                {NOTIFICATION_LABELS[notification.type]}
                              </>
                            )}
                          </p>
                          {isSystem && !systemNoActor && notification.title && (
                            <p className="mt-0.5 truncate text-[13px] font-medium text-foreground">{notification.title}</p>
                          )}
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
      </PullToRefresh>
    </div>
  );
}
