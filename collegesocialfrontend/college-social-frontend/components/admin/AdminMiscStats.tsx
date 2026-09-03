'use client';

import { Bell, BookOpen, Bot, Calendar, CheckSquare, Files, MessageSquareText } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { nf, pct } from '@/lib/format';
import { StatCard } from './ui/StatCard';
import { DashboardSkeleton } from './AdminSkeletons';
import { useAdminStats } from './AdminStatsProvider';

type Section = 'ai' | 'study' | 'notifications';

// Stats-only views (no per-record CRUD) for domains where an admin gets aggregate visibility but
// not per-user editing: AI usage, personal schedule/planner, notification analytics. All read the
// shared /admin/stats snapshot — no extra request.
export function AdminMiscStats({ section }: { section: Section }) {
  const { stats, isLoading } = useAdminStats();

  if (!stats && isLoading) return <DashboardSkeleton />;
  if (!stats) {
    return <p className="py-16 text-center text-sm text-muted-foreground">تعذّر تحميل الإحصائيات.</p>;
  }

  if (section === 'ai') {
    const byDept = Object.entries(stats.ai.lectureIndex.byDepartment);
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={Bot} label="محادثات رافد" value={stats.ai.totalConversations} exact />
          <StatCard icon={MessageSquareText} label="رسائل رافد" value={stats.ai.totalMessages} exact />
          <StatCard icon={Files} label="مقتطفات مفهرسة" value={stats.ai.lectureIndex.totalChunks} exact />
          <StatCard icon={BookOpen} label="مصادر مفهرسة" value={stats.ai.lectureIndex.indexedSources} exact />
        </div>
        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold text-foreground">فهرسة المحاضرات حسب الشعبة</p>
          {byDept.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد بيانات بعد.</p>
          ) : (
            <ul className="divide-y divide-border/60 text-sm">
              {byDept.map(([dept, count]) => (
                <li key={dept} className="flex justify-between py-1.5">
                  <span className="text-muted-foreground">{dept}</span>
                  <span className="font-semibold tabular-nums text-foreground">{nf(count)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    );
  }

  if (section === 'study') {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard icon={Calendar} label="حصص الجدول الدراسي" value={stats.schedule.totalEntries} exact />
        <StatCard icon={Calendar} label="فئات لديها جدول" value={stats.schedule.groupsCovered} exact />
        <StatCard icon={CheckSquare} label="مهام المخطط" value={stats.planner.totalTasks} exact />
        <StatCard icon={CheckSquare} label="مهام مكتملة" value={stats.planner.doneTasks} tone="success" exact />
        <StatCard icon={CheckSquare} label="مستخدمون لديهم مهام" value={stats.planner.usersWithTasks} exact />
      </div>
    );
  }

  const byType = Object.entries(stats.notifications.byType).sort((a, b) => b[1] - a[1]);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard icon={Bell} label="إجمالي الإشعارات" value={stats.notifications.total} exact />
        <StatCard icon={Bell} label="غير مقروءة" value={stats.notifications.unread} tone="warning" exact />
      </div>
      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">حسب النوع</p>
          <span className="text-xs text-muted-foreground">
            نسبة القراءة: {pct(stats.notifications.readRatePercent, false)}
          </span>
        </div>
        <ul className="divide-y divide-border/60 text-sm">
          {byType.map(([type, count]) => (
            <li key={type} className="flex justify-between py-1.5">
              <span className="font-mono text-xs text-muted-foreground">{type}</span>
              <span className="font-semibold tabular-nums text-foreground">{nf(count)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
