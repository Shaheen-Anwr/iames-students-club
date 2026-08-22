'use client';

import { useEffect, useState } from 'react';
import { GraduationCap, Heart, MessageCircle, MessageSquareText, ShieldCheck, UserCheck, Users, BadgeCheck } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Tooltip } from '@/components/ui/Tooltip';
import { api } from '@/lib/api';
import type { AdminStats as AdminStatsData, DailyCount } from '@/lib/types';

export function StatTile({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-semibold text-foreground">{value.toLocaleString('ar-EG')}</p>
        <p className="truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </Card>
  );
}

// Thin, single-hue bar chart -- magnitude is height, not color, so one accent tone is correct
// here.
export function TrendChart({ title, data }: { title: string; data: DailyCount[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <span className="text-[11px] text-muted-foreground">أعلى قيمة: {max.toLocaleString('ar-EG')}</span>
      </div>
      <div className="flex h-28 items-end gap-1">
        {data.map((d) => (
          <Tooltip key={d.date} content={`${d.date} — ${d.count.toLocaleString('ar-EG')}`} side="top" wrapperClassName="w-full flex-1">
            <div
              className="mx-auto w-full rounded-t bg-accent/70 transition-colors hover:bg-accent"
              style={{ height: `${Math.max(4, (d.count / max) * 100)}%` }}
            />
          </Tooltip>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </Card>
  );
}

export function AdminStats() {
  const [stats, setStats] = useState<AdminStatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get<AdminStatsData>('/admin/stats')
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

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">المستخدمون</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile icon={Users} label="إجمالي المستخدمين" value={stats.users.total} />
          <StatTile icon={GraduationCap} label="الطلاب" value={stats.users.students} />
          <StatTile icon={GraduationCap} label="الأساتذة" value={stats.users.professors} />
          <StatTile icon={ShieldCheck} label="المديرون" value={stats.users.admins} />
          <StatTile icon={UserCheck} label="الحسابات النشطة" value={stats.users.active} />
          <StatTile icon={BadgeCheck} label="بريد موثّق" value={stats.users.verified} />
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">المحتوى</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile icon={MessageSquareText} label="المنشورات" value={stats.posts.totalPosts} />
          <StatTile icon={MessageCircle} label="التعليقات" value={stats.posts.totalComments} />
          <StatTile icon={MessageCircle} label="الردود" value={stats.posts.totalReplies} />
          <StatTile icon={Heart} label="التفاعلات" value={stats.posts.totalReactions} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TrendChart title="تسجيلات جديدة (آخر 14 يومًا)" data={stats.users.dailySignups} />
        <TrendChart title="منشورات جديدة (آخر 14 يومًا)" data={stats.posts.dailyPosts} />
      </div>
    </div>
  );
}
