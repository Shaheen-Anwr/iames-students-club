'use client';

import { useLayoutEffect, useRef } from 'react';
import { FeedList } from '@/components/feed/FeedList';
import { FeedAiChatCard } from '@/components/feed/FeedAiChatCard';
import { FeedAccountCard } from '@/components/feed/FeedAccountCard';
import { FeedChatsCard } from '@/components/feed/FeedChatsCard';
import { FeedTodayCard } from '@/components/feed/FeedTodayCard';
import { FeedFriendSuggestionsCard } from '@/components/feed/FeedFriendSuggestionsCard';
import { ChatProvider } from '@/components/chat/ChatProvider';
import { CommunityTabs } from '@/components/community/CommunityTabs';

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
      <div ref={scrollRef} className="relative h-full overflow-x-hidden overflow-y-auto scrollbar-thin">
        <ChatProvider>
          {/* "المجتمع" hub strip -- mobile only; on desktop the top nav + right rail already
              cover cross-navigation and /feed is a full dashboard. */}
          <div className="mx-auto w-full max-w-2xl px-4 pt-4 lg:hidden">
            <CommunityTabs />
          </div>
          <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 px-4 py-6 lg:grid-cols-[300px_minmax(0,1fr)_300px]">
            <aside className="hidden lg:block">
              <div className="sticky top-0">
                <FeedAiChatCard />
              </div>
            </aside>

            <div className="min-w-0">
              <FeedList scrollRef={scrollRef} />
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
