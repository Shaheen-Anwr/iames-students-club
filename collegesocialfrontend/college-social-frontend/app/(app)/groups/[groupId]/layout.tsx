'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { GroupSidebar } from '@/components/groups/GroupSidebar';
import { GroupUiProvider } from '@/lib/group-ui-context';

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
    <GroupUiProvider>
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <GroupSidebar groupId={params.groupId} isChannelSelected={isChannelSelected} />
        <div className={cn('min-h-0 min-w-0 flex-1 flex-col', isChannelSelected ? 'flex' : 'hidden md:flex')}>
          {children}
        </div>
      </div>
    </GroupUiProvider>
  );
}
