'use client';

import { MessageCircle, Users } from 'lucide-react';
import { nf } from '@/lib/format';
import type { AdminConversationSummary } from '@/lib/types';
import { ModerationPanel } from './ModerationPanel';
import { TimeCell } from './ui/cells';
import type { Column } from './ui/types';

const label = (c: AdminConversationSummary) =>
  c.isGroup
    ? c.name || 'مجموعة بدون اسم'
    : c.participants.map((p) => p?.name ?? 'مستخدم محذوف').join('، ');

const lastActive = (c: AdminConversationSummary) => c.lastMessageAt ?? c.createdAt;

const columns: Column<AdminConversationSummary>[] = [
  {
    id: 'label',
    header: 'المحادثة',
    className: 'max-w-sm',
    sortable: true,
    sortValue: label,
    cell: (c) => <p className="truncate font-medium text-foreground">{label(c)}</p>,
    exportValue: label,
  },
  {
    id: 'type',
    header: 'النوع',
    sortable: true,
    sortValue: (c) => (c.isGroup ? 1 : 0),
    cell: (c) =>
      c.isGroup ? (
        <span className="flex items-center gap-1 text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          {nf(c.participants.length)} أعضاء
        </span>
      ) : (
        <span className="text-muted-foreground">محادثة فردية</span>
      ),
    exportValue: (c) => (c.isGroup ? `مجموعة (${c.participants.length})` : 'فردية'),
  },
  {
    id: 'lastActive',
    header: 'آخر نشاط',
    sortable: true,
    sortValue: (c) => new Date(lastActive(c)),
    cell: (c) => <TimeCell value={lastActive(c)} />,
    exportValue: (c) => lastActive(c),
  },
];

export function AdminChatPanel() {
  return (
    <ModerationPanel<AdminConversationSummary>
      path="/admin/chat/conversations"
      exportName="المحادثات"
      searchPlaceholder="ابحث باسم المجموعة"
      columns={columns}
      emptyIcon={MessageCircle}
      emptyTitle="لا توجد محادثات"
      deleteTitle="حذف المحادثة"
      deleteMessage="سيتم حذف رسائلها أيضًا ولا يمكن التراجع عن هذا الإجراء."
      defaultSort={{ id: 'lastActive', dir: 'desc' }}
      drawerTitle={label}
      drawerDescription={(c) => (c.isGroup ? 'محادثة جماعية' : 'محادثة فردية')}
      drawerBody={(c) => (
        <>
          <dl className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <dt className="text-muted-foreground">المشاركون</dt>
              <dd className="font-semibold text-foreground">{nf(c.participants.length)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">أُنشئت</dt>
              <dd className="text-foreground">
                <TimeCell value={c.createdAt} />
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted-foreground">آخر نشاط</dt>
              <dd className="text-foreground">
                <TimeCell value={lastActive(c)} />
              </dd>
            </div>
          </dl>
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
            بيانات وصفية فقط — لا يُعرض محتوى الرسائل.
          </p>
        </>
      )}
    />
  );
}
