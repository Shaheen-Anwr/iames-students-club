'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Compass, Plus, Users } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { useGroups } from '@/lib/groups-context';
import { cn } from '@/lib/utils';
import { CreateOrJoinGroupModal } from './CreateOrJoinGroupModal';

export function GroupsList() {
  const { groups, loading } = useGroups();
  const pathname = usePathname();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-4">
        <h1 className="text-lg font-semibold text-foreground">المجموعات</h1>
        <div className="flex items-center gap-1.5">
          <Link
            href="/groups/discover"
            title="اكتشف المجموعات"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-transform hover:scale-110 hover:bg-surface-2 hover:text-foreground active:scale-95"
          >
            <Compass className="h-4 w-4" />
          </Link>
          <button
            onClick={() => setModalOpen(true)}
            title="مجموعة جديدة"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-accent text-white shadow-elev-1 transition-transform hover:scale-110 hover:shadow-glow active:scale-95"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner className="h-5 w-5" />
          </div>
        ) : groups.length === 0 ? (
          <div className="mx-4 mt-4 rounded-2xl border border-dashed border-border">
            <EmptyState
              icon={Users}
              title="لا توجد مجموعات بعد"
              description="أنشئ واحدة أو انضم برمز دعوة."
            />
          </div>
        ) : (
          groups.map((group) => {
            const href = `/groups/${group._id}`;
            const active = pathname.startsWith(href);

            return (
              <Link
                key={group._id}
                href={href}
                className={cn(
                  'relative flex items-center gap-3 border-b border-border/70 px-4 py-3.5 transition-colors hover:bg-surface-2',
                  active &&
                    'bg-accent/10 hover:bg-accent/10 before:absolute before:inset-y-2 before:start-0 before:w-1 before:rounded-full before:bg-accent',
                )}
              >
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-accent text-lg font-semibold text-white">
                  {group.name.trim().slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{group.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{group.members.length} عضو</p>
                </div>
              </Link>
            );
          })
        )}
      </div>

      <CreateOrJoinGroupModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
