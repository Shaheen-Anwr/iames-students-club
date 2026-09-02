'use client';

import { Megaphone, Pin } from 'lucide-react';
import { DEPARTMENT_LABELS } from '@/lib/departments';
import type { Announcement } from '@/lib/types';
import { ModerationPanel } from './ModerationPanel';
import { PersonCell, TimeCell } from './ui/cells';
import type { Column } from './ui/types';

const scopeLabel = (a: Announcement) => (a.department ? DEPARTMENT_LABELS[a.department] : 'كل المنصة');

const columns: Column<Announcement>[] = [
  {
    id: 'author',
    header: 'الكاتب',
    sortable: true,
    sortValue: (a) => a.author?.name ?? '',
    cell: (a) => <PersonCell name={a.author?.name} photoUrl={a.author?.photoUrl} />,
    exportValue: (a) => a.author?.name ?? 'مستخدم محذوف',
  },
  {
    id: 'title',
    header: 'الإعلان',
    className: 'max-w-sm',
    cell: (a) => (
      <p className="flex items-center gap-1 truncate text-foreground">
        {a.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-accent" />}
        {a.title}
      </p>
    ),
    exportValue: (a) => a.title,
  },
  {
    id: 'scope',
    header: 'النطاق',
    sortable: true,
    sortValue: (a) => scopeLabel(a),
    cell: (a) => <span className="text-muted-foreground">{scopeLabel(a)}</span>,
    exportValue: (a) => scopeLabel(a),
  },
  {
    id: 'createdAt',
    header: 'التاريخ',
    sortable: true,
    sortValue: (a) => new Date(a.createdAt),
    cell: (a) => <TimeCell value={a.createdAt} />,
    exportValue: (a) => a.createdAt,
  },
];

export function AdminAnnouncementsPanel() {
  return (
    <ModerationPanel<Announcement>
      path="/admin/announcements"
      exportName="الإعلانات"
      searchPlaceholder="ابحث بعنوان الإعلان"
      columns={columns}
      emptyIcon={Megaphone}
      emptyTitle="لا توجد إعلانات"
      deleteTitle="حذف الإعلان"
      deleteMessage="لا يمكن التراجع عن هذا الإجراء."
      drawerTitle={(a) => a.title}
      drawerDescription={(a) => scopeLabel(a)}
      drawerBody={(a) => (
        <>
          <PersonCell name={a.author?.name} photoUrl={a.author?.photoUrl} />
          {a.body && <p className="whitespace-pre-wrap text-foreground text-pretty">{a.body}</p>}
          <dl className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <dt className="text-muted-foreground">مثبّت</dt>
              <dd className="font-semibold text-foreground">{a.pinned ? 'نعم' : 'لا'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">التاريخ</dt>
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
