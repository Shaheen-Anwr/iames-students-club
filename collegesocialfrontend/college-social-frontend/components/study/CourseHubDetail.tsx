'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  ClipboardList,
  HelpCircle,
  ListChecks,
  MapPin,
  MessageCircle,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Avatar } from '@/components/ui/Avatar';
import { LectureCard } from '@/components/lectures/LectureCard';
import { AssignmentCard } from '@/components/study/AssignmentCard';
import { QuizCard } from '@/components/quizzes/QuizCard';
import { api } from '@/lib/api';
import { WEEK_DAYS } from '@/lib/schedule-week';
import { assetUrl, cn, timeAgo } from '@/lib/utils';
import type { Assignment, Post, Question, QuizSummary, ScheduleEntry } from '@/lib/types';

type Tab = 'overview' | 'lectures' | 'assignments' | 'qa' | 'quizzes';

// Same deterministic per-course colour as CourseHub, so a course looks identical in both places.
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

interface CourseHubData {
  lectures: Post[];
  assignments: Assignment[];
  questions: Question[];
  quizzes: QuizSummary[];
  slots: ScheduleEntry[];
}

// One backend aggregate (CoursesService.getOverview) -- a single round trip instead of five,
// server-cached for a few seconds. Assignments come back sorted by due date and `slots` already
// filtered to this course + sorted, so there's nothing to post-process here.
function fetchCourseHub(courseCode: string): Promise<CourseHubData> {
  return api.get<CourseHubData>(`/courses/${encodeURIComponent(courseCode)}/overview`);
}

export function CourseHubDetail({ courseCode }: { courseCode: string }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');

  const hubKey = ['course-hub', courseCode];
  const { data, isPending: loading } = useQuery<CourseHubData>({
    queryKey: hubKey,
    queryFn: () => fetchCourseHub(courseCode),
  });
  const { lectures = [], assignments = [], questions = [], quizzes = [], slots = [] } = data ?? {};
  const patchHub = (fn: (d: CourseHubData) => CourseHubData) =>
    qc.setQueryData<CourseHubData>(hubKey, (d) => (d ? fn(d) : d));

  const counts = {
    lectures: lectures.length,
    assignments: assignments.length,
    qa: questions.length,
    quizzes: quizzes.length,
  };

  const nextAssignment = useMemo(() => {
    const now = Date.now();
    return assignments.find((a) => new Date(a.dueDate).getTime() >= now) ?? assignments[0] ?? null;
  }, [assignments]);

  const TABS: { value: Tab; label: string; icon: ComponentType<{ className?: string }> }[] = [
    { value: 'overview', label: 'نظرة عامة', icon: BookOpen },
    { value: 'lectures', label: `محاضرات ${counts.lectures || ''}`.trim(), icon: BookOpen },
    { value: 'assignments', label: `واجبات ${counts.assignments || ''}`.trim(), icon: ClipboardList },
    { value: 'qa', label: `أسئلة ${counts.qa || ''}`.trim(), icon: HelpCircle },
    { value: 'quizzes', label: `اختبارات ${counts.quizzes || ''}`.trim(), icon: ListChecks },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/study/courses"
          aria-label="رجوع إلى المقررات"
          className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-surface-2"
        >
          <ArrowRight className="h-4 w-4" />
        </Link>
        <span
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-bold',
            courseColor(courseCode),
          )}
        >
          {courseCode.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold tracking-tight text-foreground">{courseCode}</h1>
          <p className="text-xs text-muted-foreground">
            {counts.lectures} محاضرة · {counts.assignments} واجب · {counts.qa} سؤال · {counts.quizzes} اختبار
          </p>
        </div>
      </div>

      {/* This student's timetable slots for the course */}
      {slots.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {slots.map((s) => (
            <span
              key={s._id}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-surface-2/50 px-2.5 py-1 text-xs text-muted-foreground"
            >
              <CalendarClock className="h-3.5 w-3.5" />
              {WEEK_DAYS.find((d) => d.value === s.dayOfWeek)?.short ?? ''}
              <bdi dir="ltr">
                {s.startTime}–{s.endTime}
              </bdi>
              {s.location && (
                <span className="inline-flex items-center gap-0.5">
                  <MapPin className="h-3 w-3" />
                  {s.location}
                </span>
              )}
            </span>
          ))}
        </div>
      )}

      <Segmented options={TABS} value={tab} onChange={setTab} size="sm" className="max-w-full overflow-x-auto" />

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : (
        <>
          {tab === 'overview' && (
            <OverviewTab
              counts={counts}
              onJump={setTab}
              latestLecture={lectures[0] ?? null}
              nextAssignment={nextAssignment}
              latestQuestion={questions[0] ?? null}
            />
          )}

          {tab === 'lectures' &&
            (lectures.length === 0 ? (
              <EmptyState icon={BookOpen} title="لا توجد محاضرات لهذا المقرر بعد" description="ارفع أول محاضرة من قسم المحاضرات." />
            ) : (
              <div className="space-y-4">
                {lectures.map((p) => (
                  <LectureCard
                    key={p._id}
                    post={p}
                    onDeleted={(id) => patchHub((d) => ({ ...d, lectures: d.lectures.filter((x) => x._id !== id) }))}
                  />
                ))}
              </div>
            ))}

          {tab === 'assignments' &&
            (assignments.length === 0 ? (
              <EmptyState icon={ClipboardList} title="لا توجد واجبات لهذا المقرر" />
            ) : (
              <div className="space-y-4">
                {assignments.map((a) => (
                  <AssignmentCard
                    key={a._id}
                    assignment={a}
                    onDeleted={(id) => patchHub((d) => ({ ...d, assignments: d.assignments.filter((y) => y._id !== id) }))}
                  />
                ))}
              </div>
            ))}

          {tab === 'qa' &&
            (questions.length === 0 ? (
              <EmptyState icon={HelpCircle} title="لا توجد أسئلة لهذا المقرر" description="اطرح أول سؤال من قسم الأسئلة والأجوبة." />
            ) : (
              <div className="space-y-3">
                {questions.map((question) => (
                  <QuestionRow key={question._id} question={question} />
                ))}
              </div>
            ))}

          {tab === 'quizzes' &&
            (quizzes.length === 0 ? (
              <EmptyState icon={ListChecks} title="لا توجد اختبارات لهذا المقرر" />
            ) : (
              <div className="space-y-4">
                {quizzes.map((quiz) => (
                  <QuizCard
                    key={quiz._id}
                    quiz={quiz}
                    onDeleted={(id) => patchHub((d) => ({ ...d, quizzes: d.quizzes.filter((y) => y._id !== id) }))}
                  />
                ))}
              </div>
            ))}
        </>
      )}
    </div>
  );
}

/* --------------------------------- Overview -------------------------------- */

function OverviewTab({
  counts,
  onJump,
  latestLecture,
  nextAssignment,
  latestQuestion,
}: {
  counts: { lectures: number; assignments: number; qa: number; quizzes: number };
  onJump: (t: Tab) => void;
  latestLecture: Post | null;
  nextAssignment: Assignment | null;
  latestQuestion: Question | null;
}) {
  const tiles: { key: Tab; label: string; value: number; icon: ComponentType<{ className?: string }>; tone: string }[] = [
    { key: 'lectures', label: 'محاضرات', value: counts.lectures, icon: BookOpen, tone: 'bg-accent/10 text-accent' },
    { key: 'assignments', label: 'واجبات', value: counts.assignments, icon: ClipboardList, tone: 'bg-warning/10 text-warning' },
    { key: 'qa', label: 'أسئلة', value: counts.qa, icon: HelpCircle, tone: 'bg-success/10 text-success' },
    { key: 'quizzes', label: 'اختبارات', value: counts.quizzes, icon: ListChecks, tone: 'bg-accent/10 text-accent' },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onJump(t.key)}
              className="flex items-center gap-2.5 rounded-2xl border border-border/80 bg-surface px-3 py-2.5 text-start shadow-elev-1 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-elev-3 active:translate-y-0"
            >
              <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', t.tone)}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-base font-bold leading-none text-foreground">{t.value}</span>
                <span className="mt-1 block truncate text-[11px] text-muted-foreground">{t.label}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        <h2 className="text-xs font-semibold text-muted-foreground">أحدث ما في المقرر</h2>
        <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-surface">
          {latestLecture ? (
            <button
              type="button"
              onClick={() => onJump('lectures')}
              className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-surface-2/60"
            >
              <BookOpen className="h-4 w-4 shrink-0 text-accent" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {latestLecture.caption || latestLecture.attachmentOriginalName || 'محاضرة'}
                </span>
                <span className="text-xs text-muted-foreground">آخر محاضرة · {timeAgo(latestLecture.createdAt)}</span>
              </span>
            </button>
          ) : null}

          {nextAssignment ? (
            <button
              type="button"
              onClick={() => onJump('assignments')}
              className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-surface-2/60"
            >
              <ClipboardList className="h-4 w-4 shrink-0 text-warning" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{nextAssignment.title}</span>
                <span className="text-xs text-muted-foreground">
                  يستحق {timeAgo(nextAssignment.dueDate)}
                </span>
              </span>
            </button>
          ) : null}

          {latestQuestion ? (
            <Link
              href={`/study/qa/${latestQuestion._id}`}
              className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-surface-2/60"
            >
              <HelpCircle className="h-4 w-4 shrink-0 text-success" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{latestQuestion.title}</span>
                <span className="text-xs text-muted-foreground">
                  أحدث سؤال · {timeAgo(latestQuestion.createdAt)} · {latestQuestion.answerCount} إجابة
                </span>
              </span>
            </Link>
          ) : null}

          {!latestLecture && !nextAssignment && !latestQuestion && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">لا يوجد نشاط في هذا المقرر بعد.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- QA list row ------------------------------- */

function QuestionRow({ question }: { question: Question }) {
  return (
    <Link
      href={`/study/qa/${question._id}`}
      className="block rounded-2xl border border-border/80 bg-surface p-4 shadow-elev-1 transition-colors hover:bg-surface-2/60"
    >
      <div className="flex items-start gap-3">
        <Avatar src={assetUrl(question.author?.photoUrl)} name={question.author?.name ?? 'مستخدم محذوف'} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{question.title}</p>
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{question.body}</p>
          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
            <span>{question.author?.name ?? 'مستخدم محذوف'}</span>
            <span>{timeAgo(question.createdAt)}</span>
            <span className="flex items-center gap-1">
              <MessageCircle className="h-3.5 w-3.5" />
              {question.answerCount}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
