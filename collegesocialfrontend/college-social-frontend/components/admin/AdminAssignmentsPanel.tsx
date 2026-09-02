'use client';

import { CalendarDays, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { nf } from '@/lib/format';
import type { Assignment } from '@/lib/types';
import { ModerationPanel } from './ModerationPanel';
import { PersonCell, TimeCell } from './ui/cells';
import type { Column } from './ui/types';

const fmtDate = (d: string) => new Date(d).toLocaleDateString('ar-EG', { dateStyle: 'medium' });

const columns: Column<Assignment>[] = [
  {
    id: 'createdBy',
    header: 'المُنشئ',
    sortable: true,
    sortValue: (a) => a.createdBy?.name ?? '',
    cell: (a) => <PersonCell name={a.createdBy?.name} photoUrl={a.createdBy?.photoUrl} />,
    exportValue: (a) => a.createdBy?.name ?? 'مستخدم محذوف',
  },
  {
    id: 'title',
    header: 'الواجب',
    className: 'max-w-sm',
    cell: (a) => (
      <div className="min-w-0">
        <p className="truncate text-foreground">{a.title}</p>
        <p className="truncate text-xs text-muted-foreground">{a.courseCode}</p>
      </div>
    ),
    exportValue: (a) => a.title,
  },
  {
    id: 'dueDate',
    header: 'الاستحقاق',
    sortable: true,
    sortValue: (a) => new Date(a.dueDate),
    cell: (a) => {
      const overdue = new Date(a.dueDate) < new Date();
      return <span className={cn(overdue ? 'font-medium text-danger' : 'text-muted-foreground')}>{fmtDate(a.dueDate)}</span>;
    },
    exportValue: (a) => a.dueDate,
  },
  {
    id: 'completedBy',
    header: 'الإنجاز',
    sortable: true,
    sortValue: (a) => a.completedBy.length,
    cell: (a) => (
      <span className="flex items-center gap-1 text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {nf(a.completedBy.length)}
      </span>
    ),
    exportValue: (a) => a.completedBy.length,
  },
];

export function AdminAssignmentsPanel() {
  return (
    <ModerationPanel<Assignment>
      path="/admin/assignments"
      exportName="الواجبات"
      searchPlaceholder="ابحث بعنوان الواجب أو رمز المقرر"
      columns={columns}
      emptyIcon={CalendarDays}
      emptyTitle="لا توجد واجبات"
      deleteTitle="حذف الواجب"
      deleteMessage="لا يمكن التراجع عن هذا الإجراء."
      defaultSort={{ id: 'dueDate', dir: 'desc' }}
      drawerTitle={(a) => a.title}
      drawerDescription={(a) => a.courseCode}
      drawerBody={(a) => (
        <>
          <PersonCell name={a.createdBy?.name} photoUrl={a.createdBy?.photoUrl} />
          {a.description && <p className="whitespace-pre-wrap text-foreground text-pretty">{a.description}</p>}
          <dl className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <dt className="text-muted-foreground">الاستحقاق</dt>
              <dd className="font-semibold text-foreground">{fmtDate(a.dueDate)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">أنجزه</dt>
              <dd className="font-semibold text-foreground">{nf(a.completedBy.length)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted-foreground">أُنشئ</dt>
              <dd className="text-foreground">
                <TimeCell value={a.createdAt} />
              </dd>
            </div>
          </dl>
        </>
      )}
    />
  );
}
