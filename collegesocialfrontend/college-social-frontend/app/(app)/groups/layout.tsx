'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { GroupsProvider } from '@/lib/groups-context';
import { GroupsList } from '@/components/groups/GroupsList';

export default function GroupsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDetail = pathname !== '/groups';

  return (
    <GroupsProvider>
      <div className="flex min-h-0 flex-1">
        <div className={cn('flex flex-col border-e border-border bg-surface lg:w-80 lg:shrink-0', isDetail && 'hidden lg:flex')}>
          <GroupsList />
        </div>
        <div className={cn('min-h-0 flex-1 flex-col', isDetail ? 'flex' : 'hidden lg:flex')}>{children}</div>
      </div>
    </GroupsProvider>
  );
}
