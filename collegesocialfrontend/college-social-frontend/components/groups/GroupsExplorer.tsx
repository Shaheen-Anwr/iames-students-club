'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  Crown,
  Globe2,
  KeyRound,
  Lock,
  Plus,
  Search,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { api, ApiError } from '@/lib/api';
import { useGroups } from '@/lib/groups-context';
import { useToast } from '@/lib/toast-context';
import { cn } from '@/lib/utils';
import type { GroupListItem, StudyGroup } from '@/lib/types';
import { CreateOrJoinGroupModal } from './CreateOrJoinGroupModal';

type Filter = 'all' | 'mine' | 'public';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'الكل' },
  { value: 'mine', label: 'مجموعاتي' },
  { value: 'public', label: 'عامة' },
];

export function GroupsExplorer() {
  const { allGroups, allLoading, refresh } = useGroups();
  const { showToast } = useToast();
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'create' | 'join'>('create');

  function openModal(tab: 'create' | 'join') {
    setModalTab(tab);
    setModalOpen(true);
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allGroups.filter((g) => {
      if (filter === 'mine' && !g.isMember) return false;
      if (filter === 'public' && g.visibility !== 'public') return false;
      if (!q) return true;
      return g.name.toLowerCase().includes(q) || (g.description?.toLowerCase().includes(q) ?? false);
    });
  }, [allGroups, filter, query]);

  const mine = visible.filter((g) => g.isMember);
  const others = visible.filter((g) => !g.isMember);

  async function handleJoinPublic(group: GroupListItem) {
    setJoiningId(group._id);
    try {
      const joined = await api.post<StudyGroup>(`/groups/${group._id}/join`);
      await refresh();
      router.push(`/groups/${joined._id}`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر الانضمام إلى المجموعة', 'error');
    } finally {
      setJoiningId(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="border-b border-border/70 bg-surface/80 px-4 py-4 backdrop-blur-sm sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-foreground">المجموعات</h1>
              {!allLoading && (
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {allGroups.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => openModal('join')}
                title="الانضمام برمز دعوة"
                className="flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground active:scale-95"
              >
                <KeyRound className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">رمز دعوة</span>
              </button>
              <button
                onClick={() => openModal('create')}
                title="مجموعة جديدة"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-accent text-white shadow-elev-1 transition-transform hover:scale-110 hover:shadow-glow active:scale-95"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث في المجموعات"
              className="h-10 w-full rounded-full border border-transparent bg-surface-2/70 ps-9 pe-3 text-base text-foreground placeholder:text-muted-foreground transition-colors focus:border-accent/40 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 md:text-sm"
            />
          </div>

          <div className="flex gap-1 self-start rounded-full bg-surface-2 p-1">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
                  filter === f.value
                    ? 'bg-surface text-foreground shadow-soft'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-6 sm:py-5">
          {allLoading ? (
            <div className="space-y-2.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-2xl border border-border/70 bg-surface p-3.5"
                >
                  <Skeleton className="h-12 w-12 shrink-0 rounded-2xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-1/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : allGroups.length === 0 ? (
            <EmptyState
              icon={Users}
              title="لا توجد مجموعات بعد"
              description="أنشئ أول مجموعة دراسية وابدأ بدعوة زملائك."
              action={
                <Button size="sm" className="rounded-full" onClick={() => openModal('create')}>
                  <Plus className="h-4 w-4" />
                  إنشاء مجموعة
                </Button>
              }
            />
          ) : visible.length === 0 ? (
            <EmptyState icon={Search} title="لا توجد نتائج مطابقة" description="جرّب كلمة بحث أخرى." />
          ) : filter === 'all' ? (
            <div className="space-y-6">
              {mine.length > 0 && (
                <Section title="مجموعاتي" count={mine.length}>
                  {mine.map((g) => (
                    <GroupRow key={g._id} group={g} joiningId={joiningId} onJoin={handleJoinPublic} onNeedCode={() => openModal('join')} />
                  ))}
                </Section>
              )}
              {others.length > 0 && (
                <Section title="كل المجموعات" count={others.length}>
                  {others.map((g) => (
                    <GroupRow key={g._id} group={g} joiningId={joiningId} onJoin={handleJoinPublic} onNeedCode={() => openModal('join')} />
                  ))}
                </Section>
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              {visible.map((g) => (
                <GroupRow key={g._id} group={g} joiningId={joiningId} onJoin={handleJoinPublic} onNeedCode={() => openModal('join')} />
              ))}
            </div>
          )}
        </div>
      </div>

      <CreateOrJoinGroupModal open={modalOpen} onClose={() => setModalOpen(false)} initialTab={modalTab} />
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
        <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium">{count}</span>
      </h2>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function VisibilityBadge({ visibility }: { visibility: GroupListItem['visibility'] }) {
  return visibility === 'public' ? (
    <Badge variant="success">
      <Globe2 className="h-3 w-3" />
      عامة
    </Badge>
  ) : (
    <Badge variant="default">
      <Lock className="h-3 w-3" />
      خاصة
    </Badge>
  );
}

function GroupRow({
  group,
  joiningId,
  onJoin,
  onNeedCode,
}: {
  group: GroupListItem;
  joiningId: string | null;
  onJoin: (g: GroupListItem) => void;
  onNeedCode: () => void;
}) {
  const lockedPrivate = !group.isMember && group.visibility === 'private';

  const inner = (
    <>
      {group.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={group.photoUrl} alt="" className="h-12 w-12 shrink-0 rounded-2xl object-cover" />
      ) : (
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-accent text-lg font-bold text-white">
          {group.name.trim().slice(0, 1) || '؟'}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate text-[15px] font-semibold text-foreground">{group.name}</p>
          {group.isOwner && (
            <Badge variant="accent">
              <Crown className="h-3 w-3" />
              مالك
            </Badge>
          )}
          <VisibilityBadge visibility={group.visibility} />
        </div>
        {group.description && (
          <p className="mt-0.5 line-clamp-1 text-[13px] text-muted-foreground">{group.description}</p>
        )}
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          {group.memberCount} عضو
        </p>
      </div>

      <div className="shrink-0">
        {group.isMember ? (
          <ChevronLeft className="h-5 w-5 text-muted-foreground" />
        ) : group.visibility === 'public' ? (
          <Button
            size="sm"
            variant="subtle"
            className="rounded-full"
            loading={joiningId === group._id}
            onClick={(e) => {
              e.preventDefault();
              onJoin(group);
            }}
          >
            انضمام
          </Button>
        ) : (
          <span className="flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            <KeyRound className="h-3 w-3" />
            برمز دعوة
          </span>
        )}
      </div>
    </>
  );

  const className = cn(
    'flex items-center gap-3 rounded-2xl border border-border/70 bg-surface p-3 text-start transition-all sm:p-3.5',
    'hover:border-border hover:shadow-elev-2',
  );

  if (group.isMember) {
    return (
      <Link href={`/groups/${group._id}`} className={className}>
        {inner}
      </Link>
    );
  }

  if (lockedPrivate) {
    return (
      <button type="button" onClick={onNeedCode} className={cn(className, 'w-full')}>
        {inner}
      </button>
    );
  }

  return <div className={className}>{inner}</div>;
}
