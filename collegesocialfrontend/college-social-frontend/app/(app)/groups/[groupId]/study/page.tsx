'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useGroups } from '@/lib/groups-context';
import { cn } from '@/lib/utils';
import { AssignmentsBoard } from '@/components/study/AssignmentsBoard';
import { QuizzesBoard } from '@/components/quizzes/QuizzesBoard';
import { QuestionsList } from '@/components/qa/QuestionsList';

type StudyTab = 'assignments' | 'quizzes' | 'qa';

const TABS: { id: StudyTab; label: string }[] = [
  { id: 'assignments', label: 'الواجبات' },
  { id: 'quizzes', label: 'الاختبارات' },
  { id: 'qa', label: 'أسئلة وأجوبة' },
];

export default function GroupStudyPage({ params }: { params: { groupId: string } }) {
  const { user } = useAuth();
  const { findGroup } = useGroups();
  const group = findGroup(params.groupId);
  const [tab, setTab] = useState<StudyTab>('assignments');

  const isOwner = !!user && !!group && group.owner === user._id;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 overflow-y-auto p-4 scrollbar-thin md:p-6">
      <div className="flex gap-1 rounded-full bg-surface-2/70 p-1">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              tab === id ? 'bg-surface text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'assignments' && <AssignmentsBoard groupId={params.groupId} canCreate={isOwner} />}
      {tab === 'quizzes' && <QuizzesBoard groupId={params.groupId} canCreate={isOwner} />}
      {tab === 'qa' && <QuestionsList groupId={params.groupId} canCreate={isOwner} />}
    </div>
  );
}
