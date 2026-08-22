'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronUp, Send } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Spinner } from '@/components/ui/Spinner';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { assetUrl, cn, timeAgo } from '@/lib/utils';
import type { Answer, Question } from '@/lib/types';

export function QuestionDetail({ questionId }: { questionId: string }) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [question, setQuestion] = useState<Question | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get<Question>(`/qa/${questionId}`),
      api.get<Answer[]>(`/qa/${questionId}/answers`),
    ]).then(([q, a]) => {
      if (cancelled) return;
      setQuestion(q);
      setAnswers(a);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [questionId]);

  async function handleSubmitAnswer(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      const answer = await api.post<Answer>(`/qa/${questionId}/answers`, { body: text.trim() });
      setAnswers((prev) => [...prev, answer]);
      setQuestion((prev) => (prev ? { ...prev, answerCount: prev.answerCount + 1 } : prev));
      setText('');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر إرسال الإجابة', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpvote(answerId: string) {
    try {
      const updated = await api.post<Answer>(`/qa/answers/${answerId}/upvote`);
      setAnswers((prev) => prev.map((a) => (a._id === answerId ? updated : a)));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر التصويت', 'error');
    }
  }

  async function handleAccept(answerId: string) {
    try {
      await api.post(`/qa/answers/${answerId}/accept`);
      setAnswers((prev) => prev.map((a) => ({ ...a, isAccepted: a._id === answerId })));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر قبول الإجابة', 'error');
    }
  }

  if (loading || !question) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const isQuestionAuthor = !!user && question.author?._id === user._id;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-start gap-3">
          <Avatar src={assetUrl(question.author?.photoUrl)} name={question.author?.name ?? 'مستخدم محذوف'} size="md" />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-foreground">{question.title}</h1>
            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
              <span>{question.author?.name ?? 'مستخدم محذوف'}</span>
              <span>{timeAgo(question.createdAt)}</span>
              {question.courseCode && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-accent">{question.courseCode}</span>}
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{question.body}</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">{answers.length} إجابة</h2>
        {answers.map((answer) => (
          <div
            key={answer._id}
            className={cn(
              'flex items-start gap-3 rounded-2xl border p-4',
              answer.isAccepted ? 'border-success/40 bg-success/5' : 'border-border bg-surface',
            )}
          >
            <button
              onClick={() => handleUpvote(answer._id)}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors',
                user && answer.upvotes.includes(user._id) ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:bg-surface-2',
              )}
            >
              <ChevronUp className="h-4 w-4" />
              {answer.upvotes.length}
            </button>
            <Avatar src={assetUrl(answer.author?.photoUrl)} name={answer.author?.name ?? 'مستخدم محذوف'} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{answer.author?.name ?? 'مستخدم محذوف'}</span>
                  <span>{timeAgo(answer.createdAt)}</span>
                  {answer.isAccepted && (
                    <span className="flex items-center gap-1 text-success">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      إجابة مقبولة
                    </span>
                  )}
                </div>
                {isQuestionAuthor && !answer.isAccepted && (
                  <button onClick={() => handleAccept(answer._id)} className="text-xs font-medium text-accent hover:underline">
                    قبول كإجابة
                  </button>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{answer.body}</p>
            </div>
          </div>
        ))}
      </div>

      {user && (
        <form onSubmit={handleSubmitAnswer} className="flex items-start gap-2">
          <Avatar src={assetUrl(user.photoUrl)} name={user.name} size="sm" />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="اكتب إجابتك..."
            rows={2}
            className="min-h-[2.5rem] flex-1 resize-none rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
          <button
            type="submit"
            disabled={!text.trim() || submitting}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      )}
    </div>
  );
}
