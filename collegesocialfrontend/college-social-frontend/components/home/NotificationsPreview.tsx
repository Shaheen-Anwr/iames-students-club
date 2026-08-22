'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { NOTIFICATION_LABELS, notificationHref } from '@/components/layout/NotificationBell';
import { useNotifications } from '@/lib/notifications-context';
import { assetUrl, cn, timeAgo } from '@/lib/utils';
import type { Notification } from '@/lib/types';

export function NotificationsPreview() {
  const router = useRouter();
  const { notifications, markRead } = useNotifications();
  const recent = notifications.slice(0, 5);

  function handleClick(notification: Notification) {
    if (!notification.read) markRead(notification._id);
    router.push(notificationHref(notification));
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-foreground">أحدث الإشعارات</h2>
        </div>
        <Link href="/notifications" className="text-xs font-medium text-muted-foreground hover:text-accent">
          عرض الكل
        </Link>
      </div>

      {recent.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">لا توجد إشعارات بعد.</p>
      ) : (
        <div className="space-y-1">
          {recent.map((notification) => (
            <button
              key={notification._id}
              onClick={() => handleClick(notification)}
              className={cn(
                'flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-start hover:bg-surface-2',
                !notification.read && 'bg-accent/5',
              )}
            >
              <Avatar src={assetUrl(notification.actor?.photoUrl)} name={notification.actor?.name ?? 'مستخدم'} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">
                  <span className="font-medium">{notification.actor?.name ?? 'مستخدم'}</span>{' '}
                  {NOTIFICATION_LABELS[notification.type]}
                </p>
                <p className="text-[11px] text-muted-foreground">{timeAgo(notification.createdAt)}</p>
              </div>
              {!notification.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />}
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
