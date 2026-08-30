'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { ClipboardList, ListChecks, Megaphone, Plus, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Spinner } from '@/components/ui/Spinner';
import { CreateAnnouncementModal } from '@/components/announcements/CreateAnnouncementModal';
import { CreateAssignmentForm } from '@/components/study/CreateAssignmentForm';
import { CreateQuizForm } from '@/components/quizzes/CreateQuizForm';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { timeAgo } from '@/lib/utils';
import type { Announcement, Assignment, QuizSummary } from '@/lib/types';

type Modal3 = null | 'announce' | 'assignment' | 'quiz';

export function TeachHub() {
  const { user } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Modal3>(null);

  const isStaff = user?.role === 'professor' || user?.role === 'admin';

  useEffect(() => {
    if (user && !isStaff) router.replace('/home');
  }, [user, isStaff, router]);

  useEffect(() => {
    if (!user || !isStaff) return;
    Promise.allSettled([
      api.get<Assignment[]>('/assignments?limit=100'),
      api.get<QuizSummary[]>('/quizzes?limit=100'),
      api.get<Announcement[]>('/announcements?limit=50'),
    ]).then(([a, q, an]) => {
      if (a.status === 'fulfilled') setAssignments(a.value.filter((x) => x.createdBy?._id === user._id));
      if (q.status === 'fulfilled') setQuizzes(q.value.filter((x) => x.createdBy?._id === user._id));
      if (an.status === 'fulfilled') setAnnouncements(an.value.filter((x) => x.author?._id === user._id));
      setLoading(false);
    });
  }, [user, isStaff]);

  async function deleteAnnouncement(id: string) {
    if (!confirm('حذف هذا الإعلان؟')) return;
    const before = announcements;
    setAnnouncements((l) => l.filter((x) => x._id !== id));
    try {
      await api.delete(`/announcements/${id}`);
    } catch (err) {
      setAnnouncements(before);
      showToast(err instanceof ApiError ? err.message : 'تعذّر الحذف', 'error');
    }
  }

  if (!user || !isStaff) return null;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-foreground">لوحة التدريس</h1>
        <p className="text-xs text-muted-foreground">أنشئ ومتابع محتواك التعليمي لشعبتك في مكان واحد.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <QuickBtn icon={Megaphone} label="نشر إعلان" onClick={() => setModal('announce')} tone="warning" />
        <QuickBtn icon={ClipboardList} label="إنشاء واجب" onClick={() => setModal('assignment')} tone="accent" />
        <QuickBtn icon={ListChecks} label="إنشاء اختبار" onClick={() => setModal('quiz')} tone="success" />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : (
        <>
          <Card className="p-4">
            <SectionHeader icon={ClipboardList} title="واجباتي" />
            {assignments.length === 0 ? (
              <EmptyState icon={ClipboardList} title="لم تنشر واجبات بعد" />
            ) : (
              <ul className="space-y-1.5">
                {assignments.map((a) => (
                  <li key={a._id} className="flex items-center justify-between gap-3 rounded-xl px-2 py-1.5 hover:bg-surface-2/60">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{a.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.courseCode} · يستحق {format(new Date(a.dueDate), 'd MMMM', { locale: ar })}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-accent">
                      <Users className="h-3.5 w-3.5" />
                      {a.completedBy.length}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-4">
            <SectionHeader icon={ListChecks} title="اختباراتي" tone="success" />
            {quizzes.length === 0 ? (
              <EmptyState icon={ListChecks} title="لم تنشئ اختبارات بعد" />
            ) : (
              <ul className="space-y-1.5">
                {quizzes.map((q) => (
                  <li key={q._id} className="flex items-center justify-between gap-3 rounded-xl px-2 py-1.5 hover:bg-surface-2/60">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{q.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {q.courseCode ? `${q.courseCode} · ` : ''}
                        {q.questionCount} أسئلة
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-accent">
                      <Users className="h-3.5 w-3.5" />
                      {q.attemptCount}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-4">
            <SectionHeader icon={Megaphone} title="إعلاناتي" tone="warning" />
            {announcements.length === 0 ? (
              <EmptyState icon={Megaphone} title="لم تنشر إعلانات بعد" />
            ) : (
              <ul className="space-y-2">
                {announcements.map((an) => (
                  <li key={an._id} className="flex items-start justify-between gap-3 rounded-xl bg-surface-2/40 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{an.title}</p>
                      <p className="line-clamp-1 text-xs text-muted-foreground">{an.body}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{timeAgo(an.createdAt)}</p>
                    </div>
                    <button
                      onClick={() => deleteAnnouncement(an._id)}
                      className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      <CreateAnnouncementModal
        open={modal === 'announce'}
        onClose={() => setModal(null)}
        onCreated={(a) => {
          setAnnouncements((l) => [a, ...l]);
          setModal(null);
        }}
      />
      <Modal open={modal === 'assignment'} onClose={() => setModal(null)} title="إنشاء واجب">
        <CreateAssignmentForm
          onCreated={(a) => {
            setAssignments((l) => [a, ...l]);
            setModal(null);
          }}
          onClose={() => setModal(null)}
        />
      </Modal>
      <Modal open={modal === 'quiz'} onClose={() => setModal(null)} title="إنشاء اختبار">
        <CreateQuizForm
          onCreated={(q) => {
            setQuizzes((l) => [q, ...l]);
            setModal(null);
          }}
          onClose={() => setModal(null)}
        />
      </Modal>
    </div>
  );
}

function QuickBtn({
  icon: Icon,
  label,
  onClick,
  tone,
}: {
  icon: typeof Plus;
  label: string;
  onClick: () => void;
  tone: 'accent' | 'warning' | 'success';
}) {
  const toneCls =
    tone === 'accent' ? 'bg-accent/10 text-accent' : tone === 'warning' ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success';
  return (
    <button type="button" onClick={onClick} className="group">
      <Card interactive className="flex items-center gap-3 p-4">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneCls}`}>
          <Icon className="h-5 w-5" />
        </span>
        <span className="text-sm font-semibold text-foreground">{label}</span>
      </Card>
    </button>
  );
}
