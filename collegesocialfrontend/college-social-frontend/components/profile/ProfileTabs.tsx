'use client';

import { cn } from '@/lib/utils';

export type ProfileTab = 'posts' | 'about' | 'sessions';

const TABS: { id: ProfileTab; label: string }[] = [
  { id: 'posts', label: 'المنشورات' },
  { id: 'about', label: 'معلومات' },
];

const OWN_ONLY_TABS: { id: ProfileTab; label: string }[] = [{ id: 'sessions', label: 'الجلسات النشطة' }];

export function ProfileTabs({
  active,
  onChange,
  isOwn = false,
}: {
  active: ProfileTab;
  onChange: (tab: ProfileTab) => void;
  isOwn?: boolean;
}) {
  const tabs = isOwn ? [...TABS, ...OWN_ONLY_TABS] : TABS;

  return (
    <div className="flex gap-1 border-b border-border pb-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'rounded-full px-4 py-2 text-sm font-medium transition-colors',
            active === tab.id ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:bg-surface-2/70 hover:text-foreground',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
