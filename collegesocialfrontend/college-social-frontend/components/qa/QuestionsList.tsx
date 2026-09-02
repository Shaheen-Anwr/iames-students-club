'use client';

import { useState } from 'react';
import Link from 'next/link';
import { HelpCircle, MessageCircle, Plus } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { useRawQuery } from '@/lib/query';
import { useAuth } from '@/lib/auth-context';
import { DEPARTMENT_LABELS } from '@/lib/departments';
import { assetUrl, cn, timeAgo } from '@/lib/utils';
import type { PostScope, Question } from '@/lib/types';
import { AskQuestionModal } from './AskQuestionModal';

export function QuestionsList({ groupId, canCreate = true }: { groupId?: string; canCreate?: boolean } = {}) {
  const { user } = useAuth();
  const [scope, setScope] = useState<PostScope>(user?.department ? 'department' : 'public');
  const [modalOpen, setModalOpen] = useState(false);

  const path = groupId ? `/qa/group/${groupId}?limit=30` : `/qa?limit=30&scope=${scope}`;
  const { data: questions = [], isPending: loading } = useRawQuery<Question[]>(
    ['qa', groupId ?? 'feed', scope],
    path,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        {!groupId && user?.department ? (
          <div className="flex gap-1 rounded-full bg-surface-2/70 p-1">
            <button
              onClick={() => setScope('department')}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                scope === 'department' ? 'bg-surface text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {DEPARTMENT_LABELS[user.department]}
            </button>
            <button
              onClick={() => setScope('public')}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                scope === 'public' ? 'bg-surface text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              عام
            </button>
          </div>
        ) : (
          <span />
        )}
        {canCreate && (
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" />
            اطرح سؤالاً
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : questions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-16 text-center text-muted-foreground">
          <HelpCircle className="h-8 w-8" />
          <p className="text-sm">لا توجد أسئلة بعد. كن أول من يسأل.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((q) => (
            <Link
              key={q._id}
              href={groupId ? `/groups/${groupId}/study/qa/${q._id}` : `/study/qa/${q._id}`}
              className="block rounded-2xl border border-border bg-surface p-4 transition-colors hover:bg-surface-2"
            >
              <div className="flex items-start gap-3">
                <Avatar src={assetUrl(q.author?.photoUrl)} name={q.author?.name ?? 'مستخدم محذوف'} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{q.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{q.body}</p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{q.author?.name ?? 'مستخدم محذوف'}</span>
                    <span>{timeAgo(q.createdAt)}</span>
                    {q.courseCode && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-accent">{q.courseCode}</span>}
                    <span className="flex items-center gap-1">
                      <MessageCircle className="h-3.5 w-3.5" />
                      {q.answerCount}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {canCreate && <AskQuestionModal groupId={groupId} open={modalOpen} onClose={() => setModalOpen(false)} />}
    </div>
  );
}
