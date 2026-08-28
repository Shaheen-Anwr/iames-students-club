'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { ClipboardList, Plus, Users } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { Assignment } from '@/lib/types';

// Shown on the professor's home page in place of the (student-oriented) leaderboard/badges --
// a quick view of the assignments they've published and how many students have submitted so far.
export function MyAssignmentsCard() {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    api
      .get<Assignment[]>('/assignments?limit=50')
      .then((all) => {
        setAssignments(
          all
            .filter((a) => a.createdBy?._id === user._id)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 5),
        );
      })
      .finally(() => setLoading(false));
  }, [user]);

  return (
    <Card className="p-4">
      <SectionHeader
        icon={ClipboardList}
        title="واجباتك الأخيرة"
        action={
          <Link href="/study/assignments" className="text-muted-foreground hover:text-accent">
            عرض الكل
          </Link>
        }
      />

      {loading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">جارِ التحميل...</p>
      ) : assignments.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <p className="text-sm text-muted-foreground">لم تنشر أي واجبات بعد.</p>
          <Link
            href="/study/assignments?new=1"
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-accent hover:bg-accent/10"
          >
            <Plus className="h-3.5 w-3.5" />
            إنشاء واجب
          </Link>
        </div>
      ) : (
        <div className="space-y-1.5">
          {assignments.map((assignment) => (
            <Link
              key={assignment._id}
              href="/study/assignments"
              className="flex items-center justify-between gap-3 rounded-xl px-2 py-1.5 hover:bg-surface-2/60"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{assignment.title}</p>
                <p className="text-xs text-muted-foreground">
                  {assignment.courseCode} · يستحق {format(new Date(assignment.dueDate), 'd MMMM', { locale: ar })}
                </p>
              </div>
              <p className="flex shrink-0 items-center gap-1 text-xs font-semibold text-accent">
                <Users className="h-3.5 w-3.5" />
                {assignment.completedBy.length}
              </p>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
