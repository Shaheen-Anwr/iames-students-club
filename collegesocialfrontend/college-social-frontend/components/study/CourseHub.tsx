'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen, ChevronLeft, Paperclip, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { cn, timeAgo } from '@/lib/utils';
import type { CourseSummary, ScheduleEntry } from '@/lib/types';
import { ScheduleEntryForm } from './ScheduleEntryForm';

// Deterministic accent color per course code, so the same course always looks the same.
const PALETTE = [
  'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  'bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300',
  'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300',
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
];

function courseColor(code: string) {
  let hash = 0;
  for (let i = 0; i < code.length; i += 1) hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function CourseHub() {
  const { user } = useAuth();
  const canManageCourses = user?.role === 'admin' || user?.role === 'professor';
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [myEntries, setMyEntries] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    Promise.all([api.get<CourseSummary[]>('/posts/courses'), api.get<ScheduleEntry[]>('/schedule')])
      .then(([courseData, entries]) => {
        setCourses(courseData);
        setMyEntries(entries);
      })
      .finally(() => setLoading(false));
  }, []);

  const myCourseNames = Array.from(new Set(myEntries.map((e) => e.courseName))).sort((a, b) => a.localeCompare(b, 'ar'));

  function handleAdded(entry: ScheduleEntry) {
    setMyEntries((prev) => [...prev, entry]);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">مقرراتي</h2>
          {canManageCourses && (
            <Button size="sm" onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4" />
              أضف مقررًا
            </Button>
          )}
        </div>
        {myCourseNames.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {canManageCourses ? 'لم تُضِف أي مقررات إلى الجدول بعد.' : 'ستظهر هنا مقررات جدولك الدراسي بمجرد نشره من إدارة الكلية.'}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {myCourseNames.map((name) => (
              <span key={name} className={cn('rounded-full px-3 py-1.5 text-xs font-medium', courseColor(name))}>
                {name}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">مقررات النظام</h2>
        {courses.length === 0 ? (
          <div className="rounded-xl2 border border-dashed border-border bg-surface-2/40">
            <EmptyState
              icon={BookOpen}
              title="لا توجد مقررات بعد"
              description="ستظهر هنا المقررات التي تحتوي على مرفقات دراسية."
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map(({ courseCode, attachmentCount, latestAt }) => (
              <Link key={courseCode} href={`/study/courses/${encodeURIComponent(courseCode)}`} className="group">
                <Card interactive className="flex items-center gap-3 p-5">
                  <div
                    className={cn(
                      'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-bold',
                      courseColor(courseCode),
                    )}
                  >
                    {courseCode.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{courseCode}</p>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Paperclip className="h-3 w-3" />
                      <span>{attachmentCount} مرفق</span>
                      <span>·</span>
                      <span>آخر تحديث {timeAgo(latestAt)}</span>
                    </div>
                  </div>
                  <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-1" />
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {canManageCourses && (
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="إضافة مقرر">
          <ScheduleEntryForm onSaved={handleAdded} onClose={() => setModalOpen(false)} />
        </Modal>
      )}
    </div>
  );
}
