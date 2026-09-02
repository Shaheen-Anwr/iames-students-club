'use client';

import { Heart, MessageCircle, MessageSquareText } from 'lucide-react';
import { nf } from '@/lib/format';
import type { Post } from '@/lib/types';
import { ModerationPanel } from './ModerationPanel';
import { PersonCell, TimeCell } from './ui/cells';
import type { Column } from './ui/types';

const columns: Column<Post>[] = [
  {
    id: 'author',
    header: 'الكاتب',
    sortable: true,
    sortValue: (p) => p.author?.name ?? '',
    cell: (p) => <PersonCell name={p.author?.name} photoUrl={p.author?.photoUrl} sub={p.courseCode ?? undefined} />,
    exportValue: (p) => p.author?.name ?? 'مستخدم محذوف',
  },
  {
    id: 'caption',
    header: 'المحتوى',
    className: 'max-w-sm',
    cell: (p) => (
      <p className="line-clamp-2 text-foreground">
        {p.caption || <span className="text-muted-foreground">(بدون نص)</span>}
      </p>
    ),
    exportValue: (p) => p.caption ?? '',
  },
  {
    id: 'engagement',
    header: 'التفاعل',
    sortable: true,
    sortValue: (p) => p.reactions.length + p.commentCount,
    cell: (p) => (
      <div className="flex items-center gap-3 text-muted-foreground">
        <span className="flex items-center gap-1">
          <Heart className="h-3.5 w-3.5" />
          {nf(p.reactions.length)}
        </span>
        <span className="flex items-center gap-1">
          <MessageCircle className="h-3.5 w-3.5" />
          {nf(p.commentCount)}
        </span>
      </div>
    ),
    exportValue: (p) => `${p.reactions.length} تفاعل / ${p.commentCount} تعليق`,
  },
  {
    id: 'createdAt',
    header: 'التاريخ',
    sortable: true,
    sortValue: (p) => new Date(p.createdAt),
    cell: (p) => <TimeCell value={p.createdAt} />,
    exportValue: (p) => p.createdAt,
  },
];

export function AdminPostsPanel() {
  return (
    <ModerationPanel<Post>
      path="/admin/posts"
      exportName="المنشورات"
      searchPlaceholder="ابحث بنص المنشور أو رمز المقرر"
      columns={columns}
      emptyIcon={MessageSquareText}
      emptyTitle="لا توجد منشورات"
      deleteTitle="حذف المنشور"
      deleteMessage="سيتم حذف تعليقاته أيضًا ولا يمكن التراجع عن هذا الإجراء."
      bulkDelete
      drawerTitle={() => 'منشور'}
      drawerDescription={(p) => p.author?.name ?? undefined}
      drawerBody={(p) => (
        <>
          <PersonCell name={p.author?.name} photoUrl={p.author?.photoUrl} sub={p.courseCode ?? undefined} />
          <p className="whitespace-pre-wrap text-foreground text-pretty">
            {p.caption || <span className="text-muted-foreground">(بدون نص)</span>}
          </p>
          <dl className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <dt className="text-muted-foreground">التفاعلات</dt>
              <dd className="font-semibold text-foreground">{nf(p.reactions.length)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">التعليقات</dt>
              <dd className="font-semibold text-foreground">{nf(p.commentCount)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted-foreground">التاريخ</dt>
              <dd className="text-foreground">
                <TimeCell value={p.createdAt} />
              </dd>
            </div>
          </dl>
        </>
      )}
    />
  );
}
