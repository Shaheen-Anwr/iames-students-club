'use client';

import { cn } from '@/lib/utils';

export type ProfileTab = 'posts' | 'about' | 'friends';

const TABS: { id: ProfileTab; label: string }[] = [
  { id: 'posts', label: 'المنشورات' },
  { id: 'about', label: 'معلومات' },
  { id: 'friends', label: 'الأصحاب' },
];

export function ProfileTabs({
  active,
  onChange,
  friendsCount,
}: {
  active: ProfileTab;
  onChange: (tab: ProfileTab) => void;
  // Shown inline on the "friends" tab label, e.g. "الأصحاب · 12" -- computed by the caller from
  // the already-loaded profile's `friends` array, no extra fetch just for the count.
  friendsCount?: number;
}) {
  return (
    <div role="tablist" aria-label="أقسام الملف الشخصي" className="flex gap-1 overflow-x-auto scrollbar-none">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'min-h-10 shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
            active === tab.id
              ? 'bg-accent/10 text-accent ring-1 ring-inset ring-accent/20'
              : 'text-muted-foreground hover:bg-surface-2/70 hover:text-foreground',
          )}
        >
          {tab.id === 'friends' && friendsCount ? `${tab.label} · ${friendsCount}` : tab.label}
        </button>
      ))}
    </div>
  );
}
