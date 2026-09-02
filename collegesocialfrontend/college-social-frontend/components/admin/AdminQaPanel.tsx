'use client';

import { HelpCircle, MessageCircle } from 'lucide-react';
import { nf } from '@/lib/format';
import type { Question } from '@/lib/types';
import { ModerationPanel } from './ModerationPanel';
import { PersonCell, TimeCell } from './ui/cells';
import type { Column } from './ui/types';

const columns: Column<Question>[] = [
  {
    id: 'author',
    header: 'الكاتب',
    sortable: true,
    sortValue: (q) => q.author?.name ?? '',
    cell: (q) => <PersonCell name={q.author?.name} photoUrl={q.author?.photoUrl} />,
    exportValue: (q) => q.author?.name ?? 'مستخدم محذوف',
  },
  {
    id: 'title',
    header: 'السؤال',
    className: 'max-w-sm',
    cell: (q) => (
      <div className="min-w-0">
        <p className="truncate text-foreground">{q.title}</p>
        {q.courseCode && <p className="truncate text-xs text-muted-foreground">{q.courseCode}</p>}
      </div>
    ),
    exportValue: (q) => q.title,
  },
  {
    id: 'answers',
    header: 'الإجابات',
    sortable: true,
    sortValue: (q) => q.answerCount,
    cell: (q) => (
      <span className="flex items-center gap-1 text-muted-foreground">
        <MessageCircle className="h-3.5 w-3.5" />
        {nf(q.answerCount)}
      </span>
    ),
    exportValue: (q) => q.answerCount,
  },
  {
    id: 'createdAt',
    header: 'التاريخ',
    sortable: true,
    sortValue: (q) => new Date(q.createdAt),
    cell: (q) => <TimeCell value={q.createdAt} />,
    exportValue: (q) => q.createdAt,
  },
];

export function AdminQaPanel() {
  return (
    <ModerationPanel<Question>
      path="/admin/qa/questions"
      exportName="الأسئلة"
      searchPlaceholder="ابحث بعنوان السؤال أو رمز المقرر"
      columns={columns}
      emptyIcon={HelpCircle}
      emptyTitle="لا توجد أسئلة"
      deleteTitle="حذف السؤال"
      deleteMessage="سيتم حذف إجاباته أيضًا ولا يمكن التراجع عن هذا الإجراء."
      drawerTitle={(q) => q.title}
      drawerDescription={(q) => q.courseCode ?? undefined}
      drawerBody={(q) => (
        <>
          <PersonCell name={q.author?.name} photoUrl={q.author?.photoUrl} />
          <dl className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <dt className="text-muted-foreground">الإجابات</dt>
              <dd className="font-semibold text-foreground">{nf(q.answerCount)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">التاريخ</dt>
              <dd className="text-foreground">
                <TimeCell value={q.createdAt} />
              </dd>
            </div>
          </dl>
        </>
      )}
    />
  );
}
