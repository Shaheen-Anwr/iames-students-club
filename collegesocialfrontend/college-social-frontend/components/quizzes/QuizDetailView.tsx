'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Award, CheckCircle2, Trash2, Trophy, XCircle } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { RoleBadge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { assetUrl, cn, timeAgo } from '@/lib/utils';
import type { QuizAttemptResult, QuizDetail } from '@/lib/types';

export function QuizDetailView({ quizId }: { quizId: string }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  const [quiz, setQuiz] = useState<QuizDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<(number | null)[]>([]);
  const [submitting, setSubmitting] = useState(false);
  // Set once the viewer's own answers are known, either from a prior attempt or a fresh submit --
  // driving the "review" rendering (selected vs. correct) shared by both cases.
  const [reviewAnswers, setReviewAnswers] = useState<number[] | null>(null);
  const [score, setScore] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get<QuizDetail>(`/quizzes/${quizId}`).then((data) => {
      if (cancelled) return;
      setQuiz(data);
      setSelected(new Array(data.questions.length).fill(null));
      if (data.myAttempt) {
        setReviewAnswers(data.myAttempt.answers);
        setScore(data.myAttempt.score);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [quizId]);

  const isCreator = !!quiz?.createdBy && user?._id === quiz.createdBy._id;

  async function handleSubmit() {
    if (!quiz || selected.some((s) => s === null)) {
      showToast('أجب على جميع الأسئلة قبل الإرسال.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.post<QuizAttemptResult>(`/quizzes/${quizId}/attempt`, { answers: selected });
      setQuiz((prev) => (prev ? { ...prev, questions: prev.questions.map((q, i) => ({ ...q, correctIndex: result.correctIndexes[i] })) } : prev));
      setReviewAnswers(selected as number[]);
      setScore(result.score);
      showToast(`نتيجتك: ${result.score}/${result.total}`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر إرسال الإجابات.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!confirm('هل تريد حذف هذا الاختبار؟')) return;
    try {
      await api.delete(`/quizzes/${quizId}`);
      showToast('تم حذف الاختبار.');
      router.push('/quizzes');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر حذف الاختبار.', 'error');
    }
  }

  if (loading || !quiz) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const showAnswerKey = isCreator && reviewAnswers === null;
  const taking = reviewAnswers === null && !showAnswerKey;
  const answeredCount = selected.filter((s) => s !== null).length;
  const percentage = score !== null && quiz.questions.length > 0 ? Math.round((score / quiz.questions.length) * 100) : null;
  const doingGreat = percentage !== null && percentage >= 60;
  const scoreMessage =
    percentage === null
      ? ''
      : percentage >= 80
      ? 'أداء رائع! استمر على هذا المستوى 🎉'
      : percentage >= 60
      ? 'أداء جيد، أنت على الطريق الصحيح'
      : 'محاولة جيدة، راجع المادة وحاول مرة أخرى';

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-foreground">{quiz.title}</h1>
            {quiz.createdBy && (
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Avatar src={assetUrl(quiz.createdBy.photoUrl)} name={quiz.createdBy.name} size="xs" />
                <span>{quiz.createdBy.name}</span>
                <RoleBadge role={quiz.createdBy.role} />
                <span>· {timeAgo(quiz.createdAt)}</span>
                {quiz.courseCode && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-accent">{quiz.courseCode}</span>}
              </div>
            )}
            {quiz.description && <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">{quiz.description}</p>}
          </div>
          {isCreator && (
            <button
              onClick={handleDelete}
              className="rounded-full p-1.5 text-muted-foreground transition-transform hover:scale-110 hover:bg-danger/10 hover:text-danger active:scale-95"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {taking && (
          <div className="mt-4 border-t border-border pt-3.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>تقدمك</span>
              <span className="font-medium text-foreground">
                {answeredCount} من {quiz.questions.length}
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-gradient-accent transition-all duration-300"
                style={{ width: `${quiz.questions.length ? (answeredCount / quiz.questions.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}
      </Card>

      {score !== null && (
        <div
          className={cn(
            'relative overflow-hidden rounded-xl2 border p-6 text-center animate-bubble-in',
            doingGreat ? 'border-success/30 bg-success/10 shadow-[0_0_40px_-14px_rgb(var(--success)/0.5)]' : 'border-accent/30 bg-accent/10 shadow-[0_0_40px_-14px_rgb(var(--accent)/0.5)]',
          )}
        >
          <div
            className={cn(
              'mx-auto flex h-16 w-16 items-center justify-center rounded-full',
              doingGreat ? 'bg-success/15 text-success' : 'bg-accent/15 text-accent',
            )}
          >
            {doingGreat ? <Trophy className="h-8 w-8" /> : <Award className="h-8 w-8" />}
          </div>
          <p className="mt-4 text-4xl font-extrabold tracking-tight text-foreground">
            {score}
            <span className="text-lg font-medium text-muted-foreground">/{quiz.questions.length}</span>
          </p>
          <p className={cn('mt-1.5 text-sm font-medium', doingGreat ? 'text-success' : 'text-accent')}>{scoreMessage}</p>
        </div>
      )}

      <div className="space-y-4">
        {quiz.questions.map((question, qIndex) => (
          <Card key={qIndex} className="p-5">
            <div className="flex items-start gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-semibold text-accent">
                {qIndex + 1}
              </span>
              <p className="text-sm font-semibold leading-relaxed text-foreground">{question.text}</p>
            </div>
            <div className="mt-4 space-y-2">
              {question.options.map((option, oIndex) => {
                const isCorrect = question.correctIndex === oIndex;
                const isSelected = reviewAnswers ? reviewAnswers[qIndex] === oIndex : selected[qIndex] === oIndex;
                const reviewing = reviewAnswers !== null || showAnswerKey;

                return (
                  <button
                    key={oIndex}
                    type="button"
                    disabled={reviewing}
                    onClick={() => setSelected((prev) => prev.map((s, i) => (i === qIndex ? oIndex : s)))}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-start text-[15px] leading-relaxed transition-all active:scale-[0.99]',
                      !reviewing && isSelected && 'border-accent bg-accent/10 text-accent',
                      !reviewing && !isSelected && 'border-border text-foreground hover:bg-surface-2/70',
                      reviewing && isCorrect && 'border-success bg-success/10 text-success',
                      reviewing && !isCorrect && isSelected && 'border-danger bg-danger/10 text-danger',
                      reviewing && !isCorrect && !isSelected && 'border-border text-muted-foreground',
                    )}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">
                      {String.fromCharCode(65 + oIndex)}
                    </span>
                    <span className="flex-1">{option}</span>
                    {reviewing && isCorrect && <CheckCircle2 className="h-4 w-4 shrink-0 animate-bubble-in" />}
                    {reviewing && !isCorrect && isSelected && <XCircle className="h-4 w-4 shrink-0 animate-bubble-in" />}
                  </button>
                );
              })}
            </div>
          </Card>
        ))}
      </div>

      {taking && (
        <Button onClick={handleSubmit} loading={submitting} size="lg" className="w-full rounded-full">
          إرسال الإجابات
        </Button>
      )}
    </div>
  );
}
