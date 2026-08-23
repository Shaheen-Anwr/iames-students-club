'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Bell, MessageCircle, Users, MessageSquareText, Heart, HelpCircle, Share2, UserPlus, UserCheck } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { useNotifications } from '@/lib/notifications-context';
import { assetUrl, cn, timeAgo } from '@/lib/utils';
import type { Notification } from '@/lib/types';

export const NOTIFICATION_LABELS: Record<Notification['type'], string> = {
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

export const NOTIFICATION_ICONS: Record<Notification['type'], React.ComponentType<{ className?: string }>> = {
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

export function notificationHref(notification: Notification): string {
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
    case 'post_comment':
    case 'post_reaction':
    case 'post_share':
    case 'comment_reply':
    case 'comment_reaction':
    default:
      return '/feed';
  }
}

export function NotificationBell() {
  const router = useRouter();
  const { notifications, unreadCount, markRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function handleClick(notification: Notification) {
    setOpen(false);
    if (!notification.read) markRead(notification._id);
    router.push(notificationHref(notification));
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute end-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="glass absolute top-12 end-0 w-80 max-w-[90vw] rounded-xl p-2 shadow-card animate-bubble-in">
          <div className="flex items-center justify-between px-2 pb-2">
            <p className="text-sm font-semibold text-foreground">الإشعارات</p>
          </div>
          <div className="max-h-96 overflow-y-auto scrollbar-thin">
            {notifications.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">لا توجد إشعارات بعد</p>
            ) : (
              notifications.map((notification) => {
                const Icon = NOTIFICATION_ICONS[notification.type];
                return (
                  <button
                    key={notification._id}
                    onClick={() => handleClick(notification)}
                    className={cn(
                      'flex w-full items-start gap-2.5 rounded-lg px-2 py-2.5 text-start hover:bg-surface-2',
                      !notification.read && 'bg-accent/5',
                    )}
                  >
                    <Avatar src={assetUrl(notification.actor?.photoUrl)} name={notification.actor?.name ?? 'مستخدم'} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">
                        <span className="font-medium">{notification.actor?.name ?? 'مستخدم'}</span>{' '}
                        {NOTIFICATION_LABELS[notification.type]}
                      </p>
                      {notification.preview && (
                        <p className="truncate text-xs text-muted-foreground">{notification.preview}</p>
                      )}
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{timeAgo(notification.createdAt)}</p>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      {!notification.read && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />}
                      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </div>
                  </button>
                );
              })
            )}
          </div>
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="mt-1 block rounded-lg px-2 py-2 text-center text-sm font-medium text-accent hover:bg-surface-2"
          >
            عرض الكل
          </Link>
        </div>
      )}
    </div>
  );
}
