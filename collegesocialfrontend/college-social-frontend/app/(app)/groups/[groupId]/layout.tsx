'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { GroupSidebar } from '@/components/groups/GroupSidebar';

export default function GroupDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { groupId: string };
}) {
  const pathname = usePathname();
  const isChannelSelected = pathname !== `/groups/${params.groupId}`;

  return (
    <div className="flex min-h-0 flex-1">
      <div
        className={cn(
          'flex flex-col border-e border-border bg-surface md:w-64 md:shrink-0',
          isChannelSelected && 'hidden md:flex',
        )}
      >
        <GroupSidebar groupId={params.groupId} />
      </div>
      <div className={cn('min-h-0 flex-1 flex-col', isChannelSelected ? 'flex' : 'hidden md:flex')}>{children}</div>
    </div>
  );
}
