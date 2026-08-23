'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ChatProvider } from '@/components/chat/ChatProvider';
import { ConversationList } from '@/components/chat/ConversationList';
import { GroupsProvider } from '@/lib/groups-context';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDetail = pathname !== '/chat';

  return (
    <ChatProvider>
      {/* Also mounted here (not just in the /groups tree) so the Chat tab's "create/join group" button works. */}
      <GroupsProvider>
        <div className="flex min-h-0 flex-1">
          <div
            className={cn(
              'flex w-full flex-col border-e border-border bg-surface lg:w-80 lg:shrink-0',
              isDetail && 'hidden lg:flex',
            )}
          >
            <ConversationList />
          </div>
          <div className={cn('min-h-0 min-w-0 flex-1 flex-col', isDetail ? 'flex' : 'hidden lg:flex')}>{children}</div>
        </div>
      </GroupsProvider>
    </ChatProvider>
  );
}
