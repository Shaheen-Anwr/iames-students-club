'use client';

import { useState } from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Search, Users } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadError } from '@/components/ui/LoadError';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { useGroups } from '@/lib/groups-context';
import { useRawQuery } from '@/lib/query';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import type { StudyGroup } from '@/lib/types';

export function DiscoverGroups() {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { addGroup } = useGroups();
  const [query, setQuery] = useState('');
  const [joiningId, setJoiningId] = useState<string | null>(null);

  // Cached per search term; the previous results stay visible while a new search loads. A failed
  // request now surfaces LoadError instead of spinning forever (the old effect had no catch).
  const search = useDebouncedValue(query.trim());
  const {
    data: groups = [],
    isPending: loading,
    isError,
    isRefetching,
    refetch,
  } = useRawQuery<StudyGroup[]>(
    ['groups-discover', search],
    `/groups/discover${search ? `?search=${encodeURIComponent(search)}` : ''}`,
    { placeholderData: keepPreviousData },
  );

  async function handleJoin(group: StudyGroup) {
    setJoiningId(group._id);
    try {
      const joined = await api.post<StudyGroup>(`/groups/${group._id}/join`);
      addGroup(joined);
      router.push(`/groups/${joined._id}`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر الانضمام إلى المجموعة', 'error');
    } finally {
      setJoiningId(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/70 px-4 py-4 sm:px-6">
        <h1 className="mb-3 text-lg font-semibold text-foreground">اكتشف المجموعات</h1>
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث عن مجموعة عامة"
            className="h-10 w-full rounded-full border border-transparent bg-surface-2/70 ps-9 pe-3 text-base text-foreground placeholder:text-muted-foreground transition-colors focus:border-accent/40 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 md:text-sm"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner className="h-5 w-5" />
          </div>
        ) : isError && groups.length === 0 ? (
          <LoadError onRetry={() => refetch()} retrying={isRefetching} />
        ) : groups.length === 0 ? (
          <div className="mx-4 mt-4 rounded-2xl border border-dashed border-border sm:mx-6">
            <EmptyState icon={Users} title="لا توجد مجموعات عامة مطابقة" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-6">
            {groups.map((group) => {
              const isMember = !!user && group.members.includes(user._id);
              return (
                <Card key={group._id} className="flex flex-col gap-3.5 p-5 transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-elev-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-accent text-base font-semibold text-white">
                      {group.name.trim().slice(0, 1)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{group.name}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="h-3 w-3" />
                        {group.members.length} عضو
                      </p>
                    </div>
                  </div>
                  {group.description && (
                    <p className="line-clamp-2 text-[15px] leading-relaxed text-muted-foreground">{group.description}</p>
                  )}
                  <Button
                    size="sm"
                    variant={isMember ? 'outline' : 'primary'}
                    disabled={isMember}
                    loading={joiningId === group._id}
                    onClick={() => handleJoin(group)}
                    className="mt-auto rounded-full"
                  >
                    {isMember ? 'عضو بالفعل' : 'انضمام'}
                  </Button>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
