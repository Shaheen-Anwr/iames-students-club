'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from './auth-context';
import { useSocket } from './socket-context';
import { useToast } from './toast-context';
import type { Notification } from '@/lib/types';

interface NotificationsContextValue {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

const NOTIFICATION_LABELS: Record<Notification['type'], string> = {
  chat_message: 'أرسل لك رسالة',
  channel_message: 'رسالة جديدة في المجموعة',
  post_comment: 'علّق على منشورك',
  post_reaction: 'تفاعل مع منشورك',
  post_share: 'شارك منشورك',
  comment_reply: 'رد على تعليقك',
  comment_reaction: 'تفاعل مع تعليقك',
  qa_answer: 'أجاب على سؤالك',
  friend_request: 'أرسل لك طلب صحبة',
  friend_accept: 'قبل طلب صحبتك',
  reel_like: 'أعجب بالريل الخاص بك',
  reel_comment: 'علّق على الريل الخاص بك',
  reel_comment_reply: 'رد على تعليقك',
  reel_mention: 'أشار إليك في ريل',
  wall_comment: 'علّق على منشورك في الجدار',
  event_reminder: 'فعالية قريبة تنتظرك',
  // "<author name> نشر إعلانًا" -- the toast below leads with the author when known.
  system_announcement: 'نشر إعلانًا',
};

// Mounted globally (in Providers.tsx) rather than scoped like ChatProvider/GroupsProvider --
// the bell needs to be reachable from every route, not just under /chat or /groups.
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const { showToast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }
    const [list, count] = await Promise.all([
      api.get<Notification[]>('/notifications?limit=20'),
      api.get<{ count: number }>('/notifications/unread-count'),
    ]);
    setNotifications(list);
    setUnreadCount(count.count);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!socket) return;
    const onNewNotification = (notification: Notification) => {
      setNotifications((prev) => [notification, ...prev]);
      setUnreadCount((prev) => prev + 1);
      if (notification.type === 'system_announcement') {
        const who = notification.actor?.name;
        const headline = notification.title ?? NOTIFICATION_LABELS.system_announcement;
        showToast(who ? `📢 ${who}: ${headline}` : `📢 ${headline}`, 'info');
        return;
      }
      const actorName = notification.actor?.name ?? 'مستخدم';
      showToast(`${actorName} ${NOTIFICATION_LABELS[notification.type]}`, 'info');
    };
    socket.on('newNotification', onNewNotification);
    return () => {
      socket.off('newNotification', onNewNotification);
    };
  }, [socket, showToast]);

  const markRead = useCallback(async (id: string) => {
    let wasUnread = false;
    setNotifications((prev) =>
      prev.map((n) => {
        if (n._id !== id) return n;
        wasUnread = !n.read;
        return { ...n, read: true };
      }),
    );
    if (wasUnread) setUnreadCount((prev) => Math.max(0, prev - 1));
    await api.patch(`/notifications/${id}/read`);
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    await api.post('/notifications/read-all');
  }, []);

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, loading, refresh, markRead, markAllRead }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider');
  return ctx;
}
