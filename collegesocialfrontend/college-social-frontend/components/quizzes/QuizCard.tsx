'use client';

import Link from 'next/link';
import { CheckCircle2, HelpCircle, Trash2, Users } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { RoleBadge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { assetUrl, timeAgo } from '@/lib/utils';
import type { QuizSummary } from '@/lib/types';

export function QuizCard({ quiz, onDeleted }: { quiz: QuizSummary; onDeleted: (id: string) => void }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isCreator = !!quiz.createdBy && user?._id === quiz.createdBy._id;

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    if (!confirm('هل تريد حذف هذا الاختبار؟')) return;
    try {
      await api.delete(`/quizzes/${quiz._id}`);
      onDeleted(quiz._id);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر حذف الاختبار.', 'error');
    }
  }

  return (
    <Link href={`/quizzes/${quiz._id}`}>
      <Card className="p-5 transition-all hover:border-accent/40 hover:shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">{quiz.title}</h3>
              {quiz.courseCode && <span className="rounded-full bg-surface-2/70 px-2 py-0.5 text-xs text-muted-foreground">{quiz.courseCode}</span>}
              {quiz.myScore !== null && (
                <span className="flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
                  <CheckCircle2 className="h-3 w-3" />
                  {quiz.myScore}/{quiz.questionCount}
                </span>
              )}
            </div>
            {quiz.createdBy && (
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Avatar src={assetUrl(quiz.createdBy.photoUrl)} name={quiz.createdBy.name} size="xs" />
                <span>{quiz.createdBy.name}</span>
                <RoleBadge role={quiz.createdBy.role} />
                <span>· {timeAgo(quiz.createdAt)}</span>
              </div>
            )}
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

        {quiz.description && <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{quiz.description}</p>}

        <div className="mt-4 flex items-center gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <HelpCircle className="h-3.5 w-3.5" />
            {quiz.questionCount} أسئلة
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            {quiz.attemptCount} حلّوا الاختبار
          </span>
        </div>
      </Card>
    </Link>
  );
}
