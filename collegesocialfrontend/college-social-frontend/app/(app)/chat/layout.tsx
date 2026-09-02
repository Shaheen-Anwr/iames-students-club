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
        {/* Cap the whole workspace on very wide monitors so it never becomes a thin list next to a
            vast empty void; past 1600px the neutral gutter + side borders read as intentional. */}
        <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 min-[1600px]:border-x min-[1600px]:border-border">
          <div
            className={cn(
              'flex w-full flex-col border-e border-border bg-surface lg:w-80 lg:shrink-0 xl:w-[21rem] 2xl:w-[23rem]',
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
