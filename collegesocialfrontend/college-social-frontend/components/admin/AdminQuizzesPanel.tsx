'use client';

import { HelpCircle } from 'lucide-react';
import { nf } from '@/lib/format';
import type { AdminQuizListItem } from '@/lib/types';
import { ModerationPanel } from './ModerationPanel';
import { PersonCell, TimeCell } from './ui/cells';
import type { Column } from './ui/types';

const columns: Column<AdminQuizListItem>[] = [
  {
    id: 'createdBy',
    header: 'المُنشئ',
    sortable: true,
    sortValue: (q) => q.createdBy?.name ?? '',
    cell: (q) => <PersonCell name={q.createdBy?.name} photoUrl={q.createdBy?.photoUrl} />,
    exportValue: (q) => q.createdBy?.name ?? 'مستخدم محذوف',
  },
  {
    id: 'title',
    header: 'الاختبار',
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
    id: 'questionCount',
    header: 'الأسئلة',
    sortable: true,
    sortValue: (q) => q.questionCount,
    cell: (q) => <span className="tabular-nums text-muted-foreground">{nf(q.questionCount)}</span>,
    exportValue: (q) => q.questionCount,
  },
  {
    id: 'attemptCount',
    header: 'المحاولات',
    sortable: true,
    sortValue: (q) => q.attemptCount,
    cell: (q) => <span className="tabular-nums text-muted-foreground">{nf(q.attemptCount)}</span>,
    exportValue: (q) => q.attemptCount,
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

export function AdminQuizzesPanel() {
  return (
    <ModerationPanel<AdminQuizListItem>
      path="/admin/quizzes"
      exportName="الاختبارات"
      searchPlaceholder="ابحث بعنوان الاختبار أو رمز المقرر"
      columns={columns}
      emptyIcon={HelpCircle}
      emptyTitle="لا توجد اختبارات"
      deleteTitle="حذف الاختبار"
      deleteMessage="لا يمكن التراجع عن هذا الإجراء."
      drawerTitle={(q) => q.title}
      drawerDescription={(q) => q.courseCode ?? undefined}
      drawerBody={(q) => (
        <>
          <PersonCell name={q.createdBy?.name} photoUrl={q.createdBy?.photoUrl} />
          <dl className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <dt className="text-muted-foreground">الأسئلة</dt>
              <dd className="font-semibold text-foreground">{nf(q.questionCount)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">المحاولات</dt>
              <dd className="font-semibold text-foreground">{nf(q.attemptCount)}</dd>
            </div>
            <div className="col-span-2">
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
