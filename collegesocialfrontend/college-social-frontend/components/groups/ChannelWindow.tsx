'use client';

import { useEffect, useRef, useState } from 'react';
import { Hash } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useSocket } from '@/lib/socket-context';
import { useGroups } from '@/lib/groups-context';
import type { Channel, ChannelMessage } from '@/lib/types';
import { ChannelMessageBubble } from './ChannelMessageBubble';
import { ChannelMessageInput } from './ChannelMessageInput';

let typingTimeout: ReturnType<typeof setTimeout> | null = null;

export function ChannelWindow({ groupId, channelId }: { groupId: string; channelId: string }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const { findGroup } = useGroups();
  const group = findGroup(groupId);

  const [channel, setChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!socket) return;
    socket.emit('joinChannel', channelId);

    const onNewMessage = (message: ChannelMessage) => {
      if (message.channel !== channelId) return;
      setMessages((prev) => (prev.some((m) => m._id === message._id) ? prev : [...prev, message]));
    };

    const onTyping = (payload: { channelId: string; userId: string }) => {
      if (payload.channelId !== channelId || payload.userId === user?._id) return;
      setTyping(true);
      if (typingTimeout) clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => setTyping(false), 2000);
    };

    socket.on('newChannelMessage', onNewMessage);
    socket.on('userTypingChannel', onTyping);
    return () => {
      socket.off('newChannelMessage', onNewMessage);
      socket.off('userTypingChannel', onTyping);
    };
  }, [socket, channelId, user?._id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  function handleSend(text: string, attachmentUrl?: string) {
    if (!socket) return;
    socket.emit('sendChannelMessage', { channelId, text, attachmentUrl });
  }

  function handleTyping() {
    socket?.emit('channelTyping', channelId);
  }

  if (!user) return null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2.5 border-b border-border bg-surface px-4 py-3.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2/70 text-muted-foreground">
          <Hash className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{channel?.name ?? 'جارٍ التحميل…'}</p>
          {typing && <p className="animate-fade-in text-xs text-accent">يكتب أحدهم الآن…</p>}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-surface-2 px-4 py-5 scrollbar-thin sm:px-6">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner className="h-6 w-6" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2/70">
              <Hash className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">لا توجد رسائل بعد</p>
              <p className="mt-1 text-xs text-muted-foreground">ابدأ النقاش في {group?.name ?? 'المجموعة'} 👋</p>
            </div>
          </div>
        ) : (
          messages.map((message, index) => {
            const prev = messages[index - 1];
            const isOwn = message.sender?._id === user._id;
            const showAvatar = !prev || prev.sender?._id !== message.sender?._id;
            return <ChannelMessageBubble key={message._id} message={message} isOwn={isOwn} showAvatar={showAvatar} />;
          })
        )}
        <div ref={bottomRef} />
      </div>

      <ChannelMessageInput onSend={handleSend} onTyping={handleTyping} />
    </div>
  );
}
