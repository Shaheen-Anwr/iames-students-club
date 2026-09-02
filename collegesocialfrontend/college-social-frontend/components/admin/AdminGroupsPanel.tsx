'use client';

import { Users2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { nf } from '@/lib/format';
import type { StudyGroup } from '@/lib/types';
import { ModerationPanel } from './ModerationPanel';
import { TimeCell } from './ui/cells';
import type { Column } from './ui/types';

const columns: Column<StudyGroup>[] = [
  {
    id: 'name',
    header: 'المجموعة',
    sortable: true,
    sortValue: (g) => g.name,
    cell: (g) => (
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">{g.name}</p>
        {g.description && <p className="truncate text-xs text-muted-foreground">{g.description}</p>}
      </div>
    ),
    exportValue: (g) => g.name,
  },
  {
    id: 'visibility',
    header: 'النوع',
    sortable: true,
    sortValue: (g) => g.visibility,
    cell: (g) => (
      <Badge variant={g.visibility === 'public' ? 'accent' : 'default'}>
        {g.visibility === 'public' ? 'عامة' : 'خاصة'}
      </Badge>
    ),
    exportValue: (g) => (g.visibility === 'public' ? 'عامة' : 'خاصة'),
  },
  {
    id: 'members',
    header: 'الأعضاء',
    sortable: true,
    sortValue: (g) => g.members.length,
    cell: (g) => <span className="tabular-nums text-muted-foreground">{nf(g.members.length)}</span>,
    exportValue: (g) => g.members.length,
  },
  {
    id: 'createdAt',
    header: 'التاريخ',
    sortable: true,
    sortValue: (g) => new Date(g.createdAt),
    cell: (g) => <TimeCell value={g.createdAt} />,
    exportValue: (g) => g.createdAt,
  },
];

export function AdminGroupsPanel() {
  return (
    <ModerationPanel<StudyGroup>
      path="/admin/groups"
      exportName="المجموعات"
      searchPlaceholder="ابحث باسم المجموعة"
      columns={columns}
      emptyIcon={Users2}
      emptyTitle="لا توجد مجموعات"
      deleteTitle="حذف المجموعة"
      deleteMessage="سيتم حذف قنواتها ورسائلها أيضًا ولا يمكن التراجع عن هذا الإجراء."
      drawerTitle={(g) => g.name}
      drawerDescription={(g) => (g.visibility === 'public' ? 'مجموعة عامة' : 'مجموعة خاصة')}
      drawerBody={(g) => (
        <>
          {g.description && <p className="whitespace-pre-wrap text-foreground text-pretty">{g.description}</p>}
          <dl className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <dt className="text-muted-foreground">الأعضاء</dt>
              <dd className="font-semibold text-foreground">{nf(g.members.length)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">التاريخ</dt>
              <dd className="text-foreground">
                <TimeCell value={g.createdAt} />
              </dd>
            </div>
          </dl>
        </>
      )}
    />
  );
}
