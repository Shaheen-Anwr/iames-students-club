'use client';

import Link from 'next/link';
import { useState } from 'react';
import { UserRoundSearch, X } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { FriendActionButton } from '@/components/profile/FriendActionButton';
import { useFriendSuggestions } from './FeedFriendSuggestionsCard';
import { DEPARTMENT_LABELS } from '@/lib/departments';
import { assetUrl, cn } from '@/lib/utils';

const CARD_WIDTH = 116;

function CarouselCardSkeleton() {
  return (
    <div className="flex shrink-0 flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-3" style={{ width: CARD_WIDTH }}>
      <Skeleton className="h-14 w-14 rounded-full" />
      <Skeleton className="h-2.5 w-16 rounded-md" />
      <Skeleton className="h-7 w-7 rounded-full" />
    </div>
  );
}

// Mobile/tablet equivalent of FeedFriendSuggestionsCard's desktop sidebar (that sidebar is
// `hidden` below `lg` -- there's no room for it once the layout drops to a single column), styled
// as a Facebook/LinkedIn-style horizontal "people you may know" strip instead of a vertical list,
// since that's the natural shape for the space available under the composer on a phone.
export function FeedFriendSuggestionsCarousel() {
  const { suggestions, loading, dismiss } = useFriendSuggestions();
  const [dismissing, setDismissing] = useState<string | null>(null);

  if (!loading && suggestions.length === 0) return null;

  function handleDismiss(id: string) {
    // Play the exit animation before actually removing the card from the list, instead of
    // having it just vanish mid-scroll.
    setDismissing(id);
    setTimeout(() => dismiss(id), 150);
  }

  return (
    <div className="lg:hidden">
      <p className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <UserRoundSearch className="h-4 w-4 text-accent" /> أشخاص قد تعرفهم
      </p>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-none snap-x snap-mandatory overscroll-x-contain">
        {loading
          ? [0, 1, 2, 3].map((i) => <CarouselCardSkeleton key={i} />)
          : suggestions.map((s, i) => (
              <div
                key={s._id}
                className={cn(
                  'relative flex shrink-0 snap-start flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-3 pt-6 text-center shadow-soft transition-all duration-150 animate-fade-in',
                  dismissing === s._id && 'scale-90 opacity-0',
                )}
                style={{ width: CARD_WIDTH, animationDelay: `${Math.min(i, 6) * 40}ms` }}
              >
                <button
                  type="button"
                  onClick={() => handleDismiss(s._id)}
                  title="ليس الآن"
                  className="absolute end-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>

                <Link href={`/profile/${s._id}`} className="flex flex-col items-center gap-2">
                  <Avatar src={assetUrl(s.photoUrl)} name={s.name} size="lg" />
                  <div className="min-w-0">
                    <p className="line-clamp-1 text-xs font-medium text-foreground">{s.name}</p>
                    {s.department && (
                      <p className="line-clamp-1 text-[11px] text-muted-foreground">{DEPARTMENT_LABELS[s.department]}</p>
                    )}
                  </div>
                </Link>

                <FriendActionButton targetUser={s} variant="icon" />
              </div>
            ))}
      </div>
    </div>
  );
}
