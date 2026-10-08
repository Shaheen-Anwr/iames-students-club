'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/lib/auth-context';
import { useSocket } from '@/lib/socket-context';
import { messagePreview } from '@/lib/chat-helpers';
import { appInForeground, conversationAlertInfo, playChatSound } from '@/lib/chat-sounds';
import { closeChatNotifications } from '@/lib/push-notifications';
import { openChatHeadId, removeChatHead, upsertChatHead } from '@/lib/chat-heads';
import type { Message } from '@/lib/types';
import { ChatHeads } from './ChatHeads';

interface Banner {
  key: string;
  conversationId: string;
  name: string;
  photoUrl: string | null;
  groupName: string | null;
  preview: string;
}

const BANNER_MS = 4500;

// App-wide alerts for incoming chat messages while the app is open in front of the user (when it
// isn't, sw.js shows the phone's own notification instead -- the two never both fire):
//   - in the conversation being read    -> a soft "incoming" sound
//   - anywhere outside the chat screens -> a chime + a Messenger-style chat head (ChatHeads); the
//                                          bubble is added even while the app is in the background,
//                                          so it's waiting there when the user comes back
//   - another chat while inside a chat  -> a chime + a tappable banner at the top (none on the chat
//                                          list itself, which already shows it)
// Muted conversations stay silent unless you were @mentioned. Also routes notification taps
// (sw.js posts 'notification-click') through the client router, answers sw.js's "are you the
// installed app?" question, and clears a conversation's phone notifications once it's opened.
export function ChatAlertsHost() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const pathname = usePathname();
  const router = useRouter();
  const [banner, setBanner] = useState<Banner | null>(null);

  const activeId = pathname?.startsWith('/chat/') ? pathname.slice('/chat/'.length).split('/')[0] || null : null;
  const onChatList = pathname === '/chat';
  const onChatScreens = pathname === '/chat' || !!pathname?.startsWith('/chat/');
  const live = useRef({ activeId, onChatList, onChatScreens, userId: user?._id });
  useEffect(() => {
    live.current = { activeId, onChatList, onChatScreens, userId: user?._id };
  }, [activeId, onChatList, onChatScreens, user?._id]);

  useEffect(() => {
    if (!activeId) return;
    void closeChatNotifications(activeId);
    removeChatHead(activeId);
    setBanner((b) => (b?.conversationId === activeId ? null : b));
  }, [activeId]);

  useEffect(() => {
    if (!socket) return;
    const onNewMessage = (message: Message) => {
      if (!message?.conversation || message.threadRoot || message.bot === 'system') return;
      const { activeId: active, onChatList: onList, onChatScreens: inChat, userId } = live.current;
      if (userId && message.sender?._id === userId) return;
      const { muted, groupName, groupIcon } = conversationAlertInfo(message.conversation);
      if (muted && !(userId && message.mentions?.includes(userId))) return;
      const inFront = appInForeground();
      const senderName = message.sender?.name ?? (message.bot === 'rafed' ? 'رافد' : 'رسالة جديدة');
      const preview = messagePreview(message) || 'رسالة جديدة';

      if (message.conversation === active) {
        if (inFront) playChatSound('incoming');
        return;
      }
      if (!inChat) {
        upsertChatHead({
          conversationId: message.conversation,
          name: groupName ?? senderName,
          photoUrl: groupName ? groupIcon : message.sender?.photoUrl ?? null,
          isGroup: !!groupName,
          preview: groupName ? `${senderName}: ${preview}` : preview,
        });
        if (inFront) playChatSound(openChatHeadId() === message.conversation ? 'incoming' : 'notify');
        return;
      }
      if (!inFront) return;
      playChatSound('notify');
      if (onList) return;
      setBanner({
        key: message._id,
        conversationId: message.conversation,
        name: senderName,
        photoUrl: message.sender?.photoUrl ?? null,
        groupName,
        preview,
      });
    };
    socket.on('newMessage', onNewMessage);
    return () => {
      socket.off('newMessage', onNewMessage);
    };
  }, [socket]);

  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), BANNER_MS);
    return () => clearTimeout(timer);
  }, [banner]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      // sw.js asks every open window this before handling a notification tap, so the tap lands in
      // the installed app rather than a browser tab.
      if (event.data?.type === 'display-mode?') {
        const standalone =
          window.matchMedia('(display-mode: standalone)').matches ||
          (navigator as Navigator & { standalone?: boolean }).standalone === true;
        event.ports[0]?.postMessage({ mode: standalone ? 'standalone' : 'browser' });
        return;
      }
      if (event.data?.type !== 'notification-click' || typeof event.data.url !== 'string') return;
      try {
        const target = new URL(event.data.url, window.location.origin);
        if (target.origin === window.location.origin) router.push(`${target.pathname}${target.search}${target.hash}`);
      } catch {
        /* malformed url */
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [router]);

  return (
    <>
      {/* Outside the chat screens, chats arrive as Messenger-style bubbles. */}
      {!onChatScreens && <ChatHeads />}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-center px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        <AnimatePresence>
          {banner && (
            <motion.div
              key={banner.key}
              role="status"
              initial={{ y: -90, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -90, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0.7, bottom: 0 }}
              onDragEnd={(_, info) => {
                if (info.offset.y < -24) setBanner(null);
              }}
              className="pointer-events-auto flex w-full max-w-md items-center gap-1 rounded-2xl bg-surface/95 p-2 shadow-elev-4 ring-1 ring-border/60 backdrop-blur-xl"
            >
              <button
                type="button"
                onClick={() => {
                  setBanner(null);
                  router.push(`/chat/${banner.conversationId}`);
                }}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-0.5 text-start"
              >
                <Avatar src={banner.photoUrl} name={banner.name} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    <span className="truncate text-sm font-semibold text-foreground">{banner.name}</span>
                    {banner.groupName && <span className="truncate text-xs text-muted-foreground">· {banner.groupName}</span>}
                  </span>
                  <span className="line-clamp-1 text-[13px] text-muted-foreground">{banner.preview}</span>
                </span>
              </button>
              <button
                type="button"
                aria-label="إغلاق"
                onClick={() => setBanner(null)}
                className="shrink-0 rounded-full p-2 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
