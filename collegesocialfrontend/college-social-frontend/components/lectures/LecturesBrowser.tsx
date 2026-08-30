'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, FileText, LayoutGrid, List, Plus, Search, Video } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { DEPARTMENTS, DEPARTMENT_LABELS, type Department } from '@/lib/departments';
import {
  ACADEMIC_YEARS,
  ACADEMIC_YEAR_LABELS,
  getAcademicYearsForDepartment,
  type AcademicYear,
} from '@/lib/academic-years';
import {
  SPECIALIZATIONS_BY_DEPARTMENT,
  SPECIALIZATION_LABELS,
  type Specialization,
} from '@/lib/specializations';
import type { Post, PostAttachmentType } from '@/lib/types';
import { LectureCard } from './LectureCard';
import { UploadLectureModal } from './UploadLectureModal';

const SELECT_CLASS =
  'h-9 rounded-lg border border-border bg-surface-2 px-2.5 text-xs text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20';

const PAGE_SIZE = 20;

export function LecturesBrowser({
  attachmentType,
  uploadAccept,
  title,
  uploadLabel,
  emptyLabel,
  folder,
  foldersHref,
}: {
  attachmentType: Extract<PostAttachmentType, 'lecture' | 'video'>;
  uploadAccept: string;
  title: string;
  uploadLabel: string;
  emptyLabel: string;
  // When set, this is a single folder's lecture list -- courseCode is locked to `folder` and its
  // filter input is hidden (see components/lectures/LectureFoldersGrid).
  folder?: string;
  foldersHref?: string;
}) {
  const { user } = useAuth();
  const canUpload = user?.role === 'admin' || user?.role === 'professor';

  // A viewer WITH a شعبة browses only their own شعبة's material (+ college-wide uploads), enforced
  // server-side -- so the شعبة picker is hidden and locked to it. A viewer with no department
  // (rare: incomplete staff profile) keeps the cross-شعبة picker.
  const lockedDepartment: Department | '' = user?.department ?? '';
  const canPickDepartment = !lockedDepartment;

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);

  const [department, setDepartment] = useState<Department | ''>('');
  const [academicYear, setAcademicYear] = useState<AcademicYear | ''>('');
  const [specialization, setSpecialization] = useState<Specialization | ''>('');
  const [courseCode, setCourseCode] = useState('');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');

  const sortedPosts = useMemo(() => {
    const copy = [...posts];

    copy.sort((a, b) =>
      sort === 'newest'
        ? b.createdAt.localeCompare(a.createdAt)
        : a.createdAt.localeCompare(b.createdAt),
    );

    return copy;
  }, [posts, sort]);

  // The picked شعبة for staff, or the viewer's locked own شعبة otherwise.
  const effectiveDepartment = lockedDepartment || department;

  const specializationOptions = effectiveDepartment
    ? SPECIALIZATIONS_BY_DEPARTMENT[effectiveDepartment]
    : [];

  const academicYearOptions = effectiveDepartment
    ? getAcademicYearsForDepartment(effectiveDepartment)
    : ACADEMIC_YEARS;

  function buildQuery(targetPage: number) {
    const params = new URLSearchParams({
      type: attachmentType,
      page: String(targetPage),
      limit: String(PAGE_SIZE),
    });

    if (effectiveDepartment) params.set('department', effectiveDepartment);
    if (academicYear) params.set('academicYear', academicYear);
    if (specialization) params.set('specialization', specialization);

    const effectiveCourseCode = folder ?? courseCode.trim();

    if (effectiveCourseCode) {
      params.set('courseCode', effectiveCourseCode);
    }

    if (query.trim()) {
      params.set('q', query.trim());
    }

    return params.toString();
  }

  useEffect(() => {
    setLoading(true);
    setPage(1);

    api
      .get<Post[]>(`/posts/lectures?${buildQuery(1)}`)
      .then((data) => {
        setPosts(data);
        setHasMore(data.length === PAGE_SIZE);
      })
      .finally(() => setLoading(false));

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    attachmentType,
    effectiveDepartment,
    academicYear,
    specialization,
    courseCode,
    query,
    folder,
  ]);

  async function loadMore() {
    setLoadingMore(true);

    try {
      const nextPage = page + 1;
      const data = await api.get<Post[]>(
        `/posts/lectures?${buildQuery(nextPage)}`,
      );

      setPosts((prev) => [...prev, ...data]);
      setPage(nextPage);
      setHasMore(data.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }

  function handleDepartmentChange(value: Department | '') {
    setDepartment(value);
    setSpecialization('');

    if (
      value &&
      !getAcademicYearsForDepartment(value).includes(
        academicYear as AcademicYear,
      )
    ) {
      setAcademicYear('');
    }
  }

  function handleUploaded(post: Post) {
    setPosts((prev) => [post, ...prev]);
  }

  function handleDeleted(id: string) {
    setPosts((prev) => prev.filter((p) => p._id !== id));
  }

  const Icon = attachmentType === 'lecture' ? FileText : Video;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-6">
      {folder && foldersHref && (
        <Link
          href={foldersHref}
          className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-accent"
        >
          <ArrowRight className="h-3.5 w-3.5" />
          {title}
        </Link>
      )}

      <div className="flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Icon className="h-5 w-5 text-accent" />
          {folder ?? title}
        </h1>

        {canUpload && (
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" />
            {uploadLabel}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[160px] flex-1">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث..."
            className="h-9 w-full rounded-lg border border-border bg-surface-2 ps-8 pe-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
        </div>

        {canPickDepartment && (
          <select
            value={department}
            onChange={(e) =>
              handleDepartmentChange(e.target.value as Department | '')
            }
            className={SELECT_CLASS}
          >
            <option value="">كل الشعب</option>

            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {DEPARTMENT_LABELS[d]}
              </option>
            ))}
          </select>
        )}

        <select
          value={academicYear}
          onChange={(e) =>
            setAcademicYear(e.target.value as AcademicYear | '')
          }
          className={SELECT_CLASS}
        >
          <option value="">كل السنوات</option>

          {academicYearOptions.map((y) => (
            <option key={y} value={y}>
              {ACADEMIC_YEAR_LABELS[y]}
            </option>
          ))}
        </select>

        <select
          value={specialization}
          onChange={(e) =>
            setSpecialization(e.target.value as Specialization | '')
          }
          disabled={!effectiveDepartment}
          className={SELECT_CLASS}
        >
          <option value="">
            {effectiveDepartment ? 'كل التخصصات' : 'التخصص'}
          </option>

          {specializationOptions.map((s) => (
            <option key={s} value={s}>
              {SPECIALIZATION_LABELS[s]}
            </option>
          ))}
        </select>

        {!folder && (
          <input
            value={courseCode}
            onChange={(e) => setCourseCode(e.target.value)}
            placeholder="رمز المقرر"
            className="h-9 w-28 rounded-lg border border-border bg-surface-2 px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
        )}

        <select
          value={sort}
          onChange={(e) =>
            setSort(e.target.value as 'newest' | 'oldest')
          }
          className={SELECT_CLASS}
        >
          <option value="newest">الأحدث</option>
          <option value="oldest">الأقدم</option>
        </select>

        <div className="flex items-center gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5">
          <button
            type="button"
            onClick={() => setView('list')}
            title="عرض قائمة"
            className={cn(
              'rounded-md p-1.5 transition-colors',
              view === 'list'
                ? 'bg-surface text-accent shadow-soft'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <List className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setView('grid')}
            title="عرض شبكي"
            className={cn(
              'rounded-md p-1.5 transition-colors',
              view === 'grid'
                ? 'bg-surface text-accent shadow-soft'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-16 text-center text-muted-foreground">
          <Icon className="h-8 w-8" />
          <p className="text-sm">{emptyLabel}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div
            className={cn(
              view === 'grid'
                ? 'grid grid-cols-1 gap-3 sm:grid-cols-2'
                : 'space-y-3',
            )}
          >
            {sortedPosts.map((post) => (
              <LectureCard
                key={post._id}
                post={post}
                onDeleted={handleDeleted}
              />
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                size="sm"
                loading={loadingMore}
                onClick={loadMore}
              >
                عرض المزيد
              </Button>
            </div>
          )}
        </div>
      )}

      <UploadLectureModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onUploaded={handleUploaded}
        attachmentType={attachmentType}
        accept={uploadAccept}
        lockedCourseCode={folder}
        title={uploadLabel}
      />
    </div>
  );
}