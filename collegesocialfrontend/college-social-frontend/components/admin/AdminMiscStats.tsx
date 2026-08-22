'use client';

import { useEffect, useState } from 'react';
import { Bell, BookOpen, Bot, Calendar, CheckSquare, Files, MessageSquareText } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { StatTile } from './AdminStats';
import { api } from '@/lib/api';
import type { AdminStats } from '@/lib/types';

type Section = 'ai' | 'study' | 'notifications';

// Stats-only views (no per-record CRUD) for domains where an admin gets aggregate visibility
// but not per-user editing: AI usage, personal schedule/planner, and notification analytics.
export function AdminMiscStats({ section }: { section: Section }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get<AdminStats>('/admin/stats')
      .then((res) => {
        if (!cancelled) setStats(res);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (!stats) {
    return <p className="py-16 text-center text-sm text-muted-foreground">تعذّر تحميل الإحصائيات.</p>;
  }

  if (section === 'ai') {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile icon={Bot} label="محادثات المساعد الذكي" value={stats.ai.totalConversations} />
          <StatTile icon={MessageSquareText} label="رسائل المساعد" value={stats.ai.totalMessages} />
          <StatTile icon={Files} label="مقتطفات محاضرات مفهرسة" value={stats.ai.lectureIndex.totalChunks} />
          <StatTile icon={BookOpen} label="مصادر مفهرسة" value={stats.ai.lectureIndex.indexedSources} />
        </div>
        <Card className="p-4">
          <p className="mb-2 text-sm font-medium text-foreground">فهرسة المحاضرات حسب الشعبة</p>
          {Object.keys(stats.ai.lectureIndex.byDepartment).length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد بيانات بعد.</p>
          ) : (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {Object.entries(stats.ai.lectureIndex.byDepartment).map(([dept, count]) => (
                <li key={dept} className="flex justify-between">
                  <span>{dept}</span>
                  <span className="font-medium text-foreground">{count}</span>
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
        <StatTile icon={Calendar} label="حصص الجدول الدراسي" value={stats.schedule.totalEntries} />
        <StatTile icon={Calendar} label="فئات لديها جدول منشور" value={stats.schedule.groupsCovered} />
        <StatTile icon={CheckSquare} label="مهام المخطط" value={stats.planner.totalTasks} />
        <StatTile icon={CheckSquare} label="مهام مكتملة" value={stats.planner.doneTasks} />
        <StatTile icon={CheckSquare} label="مستخدمون لديهم مهام" value={stats.planner.usersWithTasks} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile icon={Bell} label="إجمالي الإشعارات" value={stats.notifications.total} />
        <StatTile icon={Bell} label="غير مقروءة" value={stats.notifications.unread} />
      </div>
      <Card className="p-4">
        <p className="mb-2 text-sm font-medium text-foreground">حسب النوع</p>
        <ul className="space-y-1 text-sm text-muted-foreground">
          {Object.entries(stats.notifications.byType).map(([type, count]) => (
            <li key={type} className="flex justify-between">
              <span>{type}</span>
              <span className="font-medium text-foreground">{count}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">نسبة القراءة: {stats.notifications.readRatePercent}%</p>
      </Card>
    </div>
  );
}
