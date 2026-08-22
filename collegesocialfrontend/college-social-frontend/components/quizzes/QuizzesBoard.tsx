'use client';

import { useEffect, useState } from 'react';
import { ListChecks, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { api } from '@/lib/api';
import type { QuizSummary } from '@/lib/types';
import { QuizCard } from './QuizCard';
import { CreateQuizForm } from './CreateQuizForm';

export function QuizzesBoard() {
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [courseCode, setCourseCode] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '50' });
    if (courseCode.trim()) params.set('courseCode', courseCode.trim());
    api
      .get<QuizSummary[]>(`/quizzes?${params.toString()}`)
      .then(setQuizzes)
      .finally(() => setLoading(false));
  }, [courseCode]);

  function handleCreated(quiz: QuizSummary) {
    setQuizzes((prev) => [quiz, ...prev]);
  }

  function handleDeleted(id: string) {
    setQuizzes((prev) => prev.filter((q) => q._id !== id));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="me-auto">
          <h1 className="text-xl font-semibold text-foreground">الاختبارات</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">اختبر معلوماتك وتابع تقدّمك في مقرراتك</p>
        </div>
        <Button size="sm" onClick={() => setModalOpen(true)} className="rounded-full">
          <Plus className="h-4 w-4" />
          إنشاء اختبار
        </Button>
      </div>

      <Input
        placeholder="تصفية حسب رمز المقرر"
        value={courseCode}
        onChange={(e) => setCourseCode(e.target.value)}
        className="max-w-xs rounded-full border-transparent bg-surface-2/70"
      />

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : quizzes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl2 border border-dashed border-border py-16 text-center text-muted-foreground">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent">
            <ListChecks className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">لا توجد اختبارات حاليًا</p>
            <p className="text-xs text-muted-foreground">كن أول من ينشئ اختبارًا لزملائك!</p>
          </div>
          <Button size="sm" onClick={() => setModalOpen(true)} className="mt-1 rounded-full">
            <Plus className="h-4 w-4" />
            إنشاء اختبار
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {quizzes.map((quiz) => (
            <QuizCard key={quiz._id} quiz={quiz} onDeleted={handleDeleted} />
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="إنشاء اختبار">
        <CreateQuizForm onCreated={handleCreated} onClose={() => setModalOpen(false)} />
      </Modal>
    </div>
  );
}
