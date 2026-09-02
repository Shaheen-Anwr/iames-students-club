'use client';

import {
  BadgeCheck,
  GraduationCap,
  Heart,
  MessageCircle,
  MessageSquareText,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import type { DailyCount } from '@/lib/types';
import { nf } from '@/lib/format';
import { StatCard } from './ui/StatCard';
import { SparkArea } from './ui/SparkArea';
import { DashboardSkeleton } from './AdminSkeletons';
import { useAdminStats } from './AdminStatsProvider';

// Thin single-hue bar chart — magnitude is height, so one accent tone is correct here. Kept for
// the two 14-day series `AdminStats` shows; other console surfaces use `SparkArea`.
export function MiniBars({ data }: { data: DailyCount[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex h-24 items-end gap-1" aria-hidden>
      {data.map((d) => (
        <div
          key={d.date}
          title={`${d.date} — ${nf(d.count)}`}
          className="w-full flex-1 rounded-t bg-accent/70 transition-colors hover:bg-accent"
          style={{ height: `${Math.max(4, (d.count / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

export function AdminStats() {
  const { stats, isLoading } = useAdminStats();

  if (!stats && isLoading) return <DashboardSkeleton />;
  if (!stats) {
    return <p className="py-16 text-center text-sm text-muted-foreground">تعذّر تحميل الإحصائيات.</p>;
  }

  return (
    <div className="space-y-6">
      <section>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">المستخدمون</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard icon={Users} label="إجمالي المستخدمين" value={stats.users.total} series={stats.users.dailySignups} exact />
          <StatCard icon={GraduationCap} label="الطلاب" value={stats.users.students} exact />
          <StatCard icon={GraduationCap} label="الأساتذة" value={stats.users.professors} tone="gold" exact />
          <StatCard icon={ShieldCheck} label="المديرون" value={stats.users.admins} tone="neutral" exact />
          <StatCard icon={UserCheck} label="الحسابات النشطة" value={stats.users.active} tone="success" exact />
          <StatCard icon={BadgeCheck} label="بريد موثّق" value={stats.users.verified} tone="success" exact />
        </div>
      </section>

      <section>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">المحتوى</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard icon={MessageSquareText} label="المنشورات" value={stats.posts.totalPosts} series={stats.posts.dailyPosts} exact />
          <StatCard icon={MessageCircle} label="التعليقات" value={stats.posts.totalComments} exact />
          <StatCard icon={MessageCircle} label="الردود" value={stats.posts.totalReplies} exact />
          <StatCard icon={Heart} label="التفاعلات" value={stats.posts.totalReactions} tone="danger" exact />
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">تسجيلات جديدة (١٤ يومًا)</p>
            <SparkArea data={stats.users.dailySignups} height={24} className="w-24" />
          </div>
          <MiniBars data={stats.users.dailySignups} />
        </Card>
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">منشورات جديدة (١٤ يومًا)</p>
            <SparkArea data={stats.posts.dailyPosts} height={24} className="w-24" />
          </div>
          <MiniBars data={stats.posts.dailyPosts} />
        </Card>
      </div>
    </div>
  );
}
