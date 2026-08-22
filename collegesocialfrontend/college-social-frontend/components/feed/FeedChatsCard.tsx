'use client';

import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/lib/auth-context';
import { useChat } from '@/components/chat/ChatProvider';
import { conversationAvatarUser, conversationTitle, isArchived } from '@/lib/chat-helpers';
import { assetUrl, timeAgo } from '@/lib/utils';

const MAX_ITEMS = 5;

// Right rail: a real preview of recent chats (not just a link/icon), matching the pattern
// used for the embedded AI chat on the left.
export function FeedChatsCard() {
  const { user } = useAuth();
  const { conversations, loading } = useChat();
  if (!user) return null;

  const list = conversations.filter((c) => !isArchived(c, user._id)).slice(0, MAX_ITEMS);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="text-sm font-semibold text-foreground">الدردشات</p>
        <Link href="/chat" className="text-xs font-medium text-accent hover:underline">
          عرض الكل
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner className="h-5 w-5" />
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
          <MessageCircle className="h-6 w-6 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">لا توجد محادثات بعد.</p>
          <Link href="/chat" className="text-xs font-medium text-accent hover:underline">
            ابدأ محادثة
          </Link>
        </div>
      ) : (
        <div>
          {list.map((conversation) => {
            const title = conversationTitle(conversation, user._id);
            const avatarUser = conversationAvatarUser(conversation, user._id);
            const unread = conversation.unreadCount ?? 0;

            return (
              <Link
                key={conversation._id}
                href={`/chat/${conversation._id}`}
                className="flex items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-surface-2"
              >
                <Avatar src={assetUrl(conversation.groupIcon ?? avatarUser?.photoUrl)} name={title} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{title}</p>
                    {conversation.lastMessageAt && (
                      <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(conversation.lastMessageAt)}</span>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{conversation.lastMessagePreview || 'قل مرحبًا 👋'}</p>
                </div>
                {unread > 0 && (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}
