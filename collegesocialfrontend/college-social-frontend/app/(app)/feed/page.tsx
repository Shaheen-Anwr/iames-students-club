'use client';

import { useLayoutEffect, useRef } from 'react';
import { FeedList } from '@/components/feed/FeedList';
import { FeedAiChatCard } from '@/components/feed/FeedAiChatCard';
import { FeedAccountCard } from '@/components/feed/FeedAccountCard';
import { FeedChatsCard } from '@/components/feed/FeedChatsCard';
import { FeedTodayCard } from '@/components/feed/FeedTodayCard';
import { FeedFriendSuggestionsCard } from '@/components/feed/FeedFriendSuggestionsCard';
import { ChatProvider } from '@/components/chat/ChatProvider';

export default function FeedPage() {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Mobile browsers (iOS Safari in particular) restore this div's previous scrollTop when the
  // page comes back from bfcache (app-switch, swipe-back) -- reset to the top on every mount and
  // every such restore so the feed never reopens scrolled past its own top.
  useLayoutEffect(() => {
    const reset = () => scrollRef.current?.scrollTo(0, 0);
    reset();
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div aria-hidden className="bg-mesh pointer-events-none absolute inset-0 opacity-70" />
      <div ref={scrollRef} className="relative h-full overflow-y-auto scrollbar-thin">
        <ChatProvider>
          <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 px-4 py-6 lg:grid-cols-[300px_minmax(0,1fr)_300px]">
            <aside className="hidden lg:block">
              <div className="sticky top-0">
                <FeedAiChatCard />
              </div>
            </aside>

            <div className="min-w-0">
              <FeedList />
            </div>

            <aside className="hidden lg:block">
              <div className="sticky top-0 space-y-4">
                <FeedTodayCard />
                <FeedAccountCard />
                <FeedFriendSuggestionsCard />
                <FeedChatsCard />
              </div>
            </aside>
          </div>
        </ChatProvider>
      </div>
    </div>
  );
}
