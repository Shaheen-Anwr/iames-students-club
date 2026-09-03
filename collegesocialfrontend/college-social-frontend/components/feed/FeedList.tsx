'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Inbox } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';
import { useInfiniteApiList } from '@/lib/query';
import { assetUrl } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { DEPARTMENTS, DEPARTMENT_LABELS, type Department } from '@/lib/departments';
import { ACADEMIC_YEARS, getAcademicYearsForDepartment, type AcademicYear } from '@/lib/academic-years';
import { SPECIALIZATIONS, SPECIALIZATIONS_BY_DEPARTMENT, type Specialization } from '@/lib/specializations';
import type { Post, PostScope } from '@/lib/types';
import { CreatePostBox } from './CreatePostBox';
import { PostCard } from './PostCard';
import { FeedToolbar, type SortMode } from './FeedToolbar';
import { AnnouncementsStrip } from '@/components/announcements/AnnouncementsStrip';
import { FeedFriendSuggestionsCarousel } from './FeedFriendSuggestionsCarousel';

const PAGE_SIZE = 10;

export function FeedList() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // "قسمي" only makes sense for a user who has a department -- otherwise there's nothing to
  // scope it to, so the feed is silently public-only for them (no tabs shown).
  const requestedScope = searchParams.get('scope') === 'department' ? 'department' : 'public';
  const scope: PostScope = user?.department ? requestedScope : 'public';
  const isNewUser = searchParams.get('new') === '1';

  const qc = useQueryClient();
  const [courseCode, setCourseCode] = useState<string | null>(null);
  const [department, setDepartment] = useState<Department | ''>('');
  const [academicYear, setAcademicYear] = useState<AcademicYear | ''>('');
  const [specialization, setSpecialization] = useState<Specialization | ''>('');
  const [sortMode, setSortMode] = useState<SortMode>('latest');

  // The year/specialization option lists follow the viewer's own شعبة when they have one -- both
  // feed tabs are now locked to it server-side. The "عام" شعبة dropdown only exists for a viewer
  // with no department (staff/admin), in which case fall back to whatever they picked there.
  const effectiveDepartment = user?.department ?? (scope === 'public' ? department : '');

  // If the effective department changes (switching tabs, or narrowing the "عام" filter) and the
  // currently selected year/specialization no longer belongs to it, drop them rather than send a
  // query that can never match (e.g. year5 for a 4-year department).
  useEffect(() => {
    if (!effectiveDepartment) return;
    if (academicYear && !getAcademicYearsForDepartment(effectiveDepartment).includes(academicYear)) {
      setAcademicYear('');
    }
    if (specialization && !SPECIALIZATIONS_BY_DEPARTMENT[effectiveDepartment].includes(specialization)) {
      setSpecialization('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveDepartment]);

  const baseQuery = (() => {
    const qs = new URLSearchParams({ scope });
    if (courseCode) qs.set('courseCode', courseCode);
    if (department) qs.set('department', department);
    if (academicYear) qs.set('academicYear', academicYear);
    if (specialization) qs.set('specialization', specialization);
    return qs.toString();
  })();

  // Every param that changes the result set is in the key, so switching tab/filter refetches
  // (and re-reads cache instantly if that combination was seen in the last 30s).
  const cacheKey = ['feed', scope, courseCode, department, academicYear, specialization];
  const {
    items: posts,
    isPending: loading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteApiList<Post>(`/posts?${baseQuery}`, { key: cacheKey, pageSize: PAGE_SIZE });

  type FeedCache = InfiniteData<Post[], number>;
  const prependPost = (post: Post) =>
    qc.setQueryData<FeedCache>(cacheKey, (old) =>
      old
        ? { ...old, pages: [[post, ...(old.pages[0] ?? [])], ...old.pages.slice(1)] }
        : { pages: [[post]], pageParams: [1] },
    );

  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasNextPage || loading) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: '600px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, loading, isFetchingNextPage, fetchNextPage]);

  // A freshly created/shared post only belongs at the top of the list if it actually matches
  // every filter currently applied -- mirrors what the server would return for buildQuery().
  function matchesFilters(post: Post) {
    // The server's "عام" feed also returns the viewer's own friends-only / "only me" posts (see
    // PostsService.feed()), so those belong at the top of the public tab right after creation too.
    const isOwnRestricted =
      (post.scope === 'friends' || post.scope === 'private') && !!user && post.author?._id === user._id;
    const scopeMatches = post.scope === scope || (scope === 'public' && isOwnRestricted);
    return (
      scopeMatches &&
      (!courseCode || post.courseCode === courseCode) &&
      (!department || post.department === department) &&
      (!academicYear || post.academicYear === academicYear) &&
      (!specialization || post.specialization === specialization)
    );
  }

  function handleCreated(post: Post) {
    if (matchesFilters(post)) prependPost(post);
  }

  function handleShared(post: Post) {
    if (matchesFilters(post)) prependPost(post);
  }

  function handleDeleted(id: string) {
    qc.setQueryData<FeedCache>(cacheKey, (old) =>
      old ? { ...old, pages: old.pages.map((pg) => pg.filter((p) => p._id !== id)) } : old,
    );
  }

  const displayPosts = useMemo(() => {
    if (sortMode === 'latest') return posts;
    if (sortMode === 'engaged') {
      const score = (p: Post) => p.reactions.length + p.commentCount + (p.shareCount ?? 0);
      return [...posts].sort((a, b) => score(b) - score(a));
    }
    // Groups the currently loaded posts by category, in the catalog's fixed order (not
    // alphabetical) -- posts without a tag for that category sink to the end. Array.prototype.sort
    // is stable, so posts within the same group keep their existing (reverse-chronological) order.
    const rank = <T extends string>(order: readonly T[], value: T | null | undefined) => {
      if (!value) return order.length;
      const idx = order.indexOf(value);
      return idx === -1 ? order.length : idx;
    };
    if (sortMode === 'department') return [...posts].sort((a, b) => rank(DEPARTMENTS, a.department) - rank(DEPARTMENTS, b.department));
    if (sortMode === 'academicYear') return [...posts].sort((a, b) => rank(ACADEMIC_YEARS, a.academicYear) - rank(ACADEMIC_YEARS, b.academicYear));
    return [...posts].sort((a, b) => rank(SPECIALIZATIONS, a.specialization) - rank(SPECIALIZATIONS, b.specialization));
  }, [posts, sortMode]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Avatar src={assetUrl(user?.photoUrl)} name={user?.name ?? '?'} size="md" />
        <h1 className="text-gradient-accent text-xl font-extrabold tracking-tight text-balance">
          {isNewUser
            ? `Welcome to our community${user?.name ? `, ${user.name}` : ''}!`
            : `Welcome back${user?.name ? `, ${user.name}` : ''}`}
        </h1>
      </div>

      <FeedToolbar
        scope={scope}
        onScopeChange={(next) => router.replace(`/feed?scope=${next}`)}
        showScopeTabs={!!user?.department}
        departmentLabel={user?.department ? DEPARTMENT_LABELS[user.department] : undefined}
        viewerDepartment={user?.department ?? undefined}
        courseCode={courseCode}
        onCourseChange={setCourseCode}
        department={department}
        onDepartmentChange={setDepartment}
        academicYear={academicYear}
        onAcademicYearChange={setAcademicYear}
        specialization={specialization}
        onSpecializationChange={setSpecialization}
        sortMode={sortMode}
        onSortChange={setSortMode}
      />

      <AnnouncementsStrip />

      <CreatePostBox onCreated={handleCreated} defaultScope={scope} />

      <FeedFriendSuggestionsCarousel />

      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface-2/40">
          <EmptyState
            icon={Inbox}
            title="لا توجد منشورات بعد"
            description="كن أول من يشارك ملاحظة أو سؤالًا أو تحديثًا مع زملائك."
          />
        </div>
      ) : (
        <>
          {displayPosts.map((post, i) => (
            <div key={post._id} className="animate-fade-in" style={{ animationDelay: `${Math.min(i, 6) * 30}ms` }}>
              <PostCard post={post} onDeleted={handleDeleted} onShared={handleShared} />
            </div>
          ))}
          {hasNextPage && (
            <div ref={sentinelRef} className="flex justify-center py-4">
              {isFetchingNextPage && <Spinner className="h-5 w-5" />}
            </div>
          )}
        </>
      )}
    </div>
  );
}
