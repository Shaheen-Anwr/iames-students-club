'use client';

import { cn } from '@/lib/utils';

export type ProfileTab = 'posts' | 'about' | 'friends';

const TABS: { id: ProfileTab; label: string }[] = [
  { id: 'posts', label: 'المنشورات' },
  { id: 'about', label: 'معلومات' },
  { id: 'friends', label: 'الأصدقاء' },
];

export function ProfileTabs({
  active,
  onChange,
  friendsCount,
}: {
  active: ProfileTab;
  onChange: (tab: ProfileTab) => void;
  // Shown inline on the "friends" tab label, e.g. "الأصدقاء · 12" -- computed by the caller from
  // the already-loaded profile's `friends` array, no extra fetch just for the count.
  friendsCount?: number;
}) {
  return (
    <div className="flex gap-1 border-b border-border pb-2">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'rounded-full px-4 py-2 text-sm font-medium transition-colors',
            active === tab.id ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:bg-surface-2/70 hover:text-foreground',
          )}
        >
          {tab.id === 'friends' && friendsCount ? `${tab.label} · ${friendsCount}` : tab.label}
        </button>
      ))}
    </div>
  );
}
