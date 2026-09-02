'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Area,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  CalendarClock,
  ChevronLeft,
  LayoutDashboard,
  type LucideIcon,
  MailWarning,
  MessageSquareText,
  Radio,
  Trophy,
  Users,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Segmented } from '@/components/ui/Segmented';
import { useRawQuery } from '@/lib/query';
import { useSocket } from '@/lib/socket-context';
import { assetUrl, cn, timeAgo } from '@/lib/utils';
import { delta as calcDelta, nf } from '@/lib/format';
import { transitions } from '@/lib/motion';
import { DEPARTMENT_LABELS } from '@/lib/departments';
import {
  ROLE_LABELS,
  type AdminActivityEvent,
  type AdminTrends,
  type DailyCount,
  type LeaderboardEntry,
} from '@/lib/types';
import { PageHeader } from './ui/PageHeader';
import { StatCard } from './ui/StatCard';
import { Heatmap } from './ui/Heatmap';
import { DashboardSkeleton } from './AdminSkeletons';
import { useAdminStats } from './AdminStatsProvider';

const CHART_COLORS = [
  'rgb(var(--accent))',
  'rgb(var(--accent-2))',
  'rgb(var(--success))',
  'rgb(var(--gold))',
  'rgb(var(--warning))',
  'rgb(var(--danger))',
];

const TOOLTIP_STYLE = {
  background: 'rgb(var(--surface))',
  border: '1px solid rgb(var(--border))',
  borderRadius: 10,
  fontSize: 12,
} as const;

const ACTIVITY_LABEL: Record<AdminActivityEvent['type'], string> = {
  signup: 'تسجيل جديد',
  post: 'منشور جديد',
  moderation: 'إجراء إداري',
};

const RANGE_OPTIONS = [
  { value: '7', label: '٧ أيام' },
  { value: '14', label: '١٤ يومًا' },
  { value: '30', label: '٣٠ يومًا' },
  { value: '90', label: '٩٠ يومًا' },
];

type SegmentView = 'roles' | 'departments';

const trimDate = (iso: string) => iso.slice(5);

export function AdminOverview() {
  const { stats, isLoading: statsLoading } = useAdminStats();
  const { socket } = useSocket();

  const [range, setRange] = useState('14');
  const [segView, setSegView] = useState<SegmentView>('roles');
  const [onlineNow, setOnlineNow] = useState<number | null>(null);
  const [onlineSeries, setOnlineSeries] = useState<DailyCount[]>([]);
  const [activity, setActivity] = useState<AdminActivityEvent[]>([]);

  const trendsQuery = useRawQuery<AdminTrends>(['admin-trends', range], `/admin/stats/trends?range=${range}`, {
    staleTime: 60_000,
  });
  // The heatmap always wants the long window regardless of the range control (dedupes at 90).
  const heatQuery = useRawQuery<AdminTrends>(['admin-trends', '90'], '/admin/stats/trends?range=90', {
    staleTime: 5 * 60_000,
  });
  const leaderboardQuery = useRawQuery<LeaderboardEntry[]>(
    ['admin-leaderboard'],
    '/admin/gamification/leaderboard?limit=5',
    { staleTime: 60_000 },
  );

  const trends = trendsQuery.data;

  useEffect(() => {
    if (stats?.users.online != null) setOnlineNow((prev) => prev ?? stats.users.online);
  }, [stats?.users.online]);

  useEffect(() => {
    if (!socket) return;
    const onPresence = (p: { online: number }) => {
      setOnlineNow(p.online);
      setOnlineSeries((prev) => [...prev, { date: new Date().toISOString(), count: p.online }].slice(-40));
    };
    const onActivity = (e: AdminActivityEvent) => setActivity((prev) => [e, ...prev].slice(0, 20));
    socket.on('admin:presence', onPresence);
    socket.on('admin:activity', onActivity);
    return () => {
      socket.off('admin:presence', onPresence);
      socket.off('admin:activity', onActivity);
    };
  }, [socket]);

  const engagementData = useMemo(() => {
    if (!trends) return [];
    return trends.signups.series.map((d, i) => ({
      date: trimDate(d.date),
      تسجيلات: d.count,
      منشورات: trends.posts.series[i]?.count ?? 0,
      'رسائل الدردشة': trends.chatMessages.series[i]?.count ?? 0,
    }));
  }, [trends]);

  const roleData = useMemo(() => {
    if (!stats) return [];
    return [
      { name: ROLE_LABELS.student, value: stats.users.students },
      { name: ROLE_LABELS.professor, value: stats.users.professors },
      { name: ROLE_LABELS.admin, value: stats.users.admins },
    ].filter((d) => d.value > 0);
  }, [stats]);

  const departmentData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.users.byDepartment)
      .map(([dept, count]) => ({
        name: DEPARTMENT_LABELS[dept as keyof typeof DEPARTMENT_LABELS] ?? dept,
        value: count,
      }))
      .sort((a, b) => b.value - a.value);
  }, [stats]);

  if (!stats && statsLoading) return <DashboardSkeleton />;
  if (!stats) {
    return <p className="py-16 text-center text-sm text-muted-foreground">تعذّر تحميل النظرة العامة.</p>;
  }

  const pendingVerifications = Math.max(0, stats.users.total - stats.users.verified);
  const segData = segView === 'roles' ? roleData : departmentData;

  const attentionRows: { icon: LucideIcon; label: string; count: number; href: string; tone: string }[] = [
    {
      icon: MailWarning,
      label: 'بريد بانتظار التوثيق',
      count: pendingVerifications,
      href: '/admin/users?verified=false',
      tone: 'text-warning bg-warning/10',
    },
    {
      icon: MessageSquareText,
      label: 'أسئلة بلا إجابة',
      count: stats.qa.unanswered,
      href: '/admin/content/qa',
      tone: 'text-accent bg-accent/10',
    },
    {
      icon: CalendarClock,
      label: 'واجبات فات موعدها',
      count: stats.assignments.overdue,
      href: '/admin/learning/assignments',
      tone: 'text-danger bg-danger/10',
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        icon={LayoutDashboard}
        title="نظرة عامة"
        description="نبض المنصة خلال الفترة المحددة."
        actions={<Segmented size="sm" value={range} onChange={setRange} options={RANGE_OPTIONS} />}
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          icon={Radio}
          tone="success"
          label="متصلون الآن"
          value={onlineNow ?? stats.users.online}
          series={onlineSeries.length > 2 ? onlineSeries : undefined}
          exact
        />
        <StatCard
          icon={Users}
          tone="accent"
          label="إجمالي المستخدمين"
          value={stats.users.total}
          href="/admin/users/stats"
          series={trends?.signups.series}
          delta={trends ? calcDelta(trends.signups.current, trends.signups.previous) : undefined}
        />
        <StatCard
          icon={MailWarning}
          tone="warning"
          label="بريد بانتظار التوثيق"
          value={pendingVerifications}
          href="/admin/users?verified=false"
          exact
        />
        <StatCard
          icon={MessageSquareText}
          tone="accent"
          label="المنشورات"
          value={stats.posts.totalPosts}
          href="/admin/content/posts"
          series={trends?.posts.series}
          delta={trends ? calcDelta(trends.posts.current, trends.posts.previous) : undefined}
        />
        <StatCard
          icon={Activity}
          tone="accent"
          label="رسائل الدردشة"
          value={stats.chat.totalMessages}
          href="/admin/community/chat"
          series={trends?.chatMessages.series}
          delta={trends ? calcDelta(trends.chatMessages.current, trends.chatMessages.previous) : undefined}
        />
        <StatCard
          icon={Trophy}
          tone="gold"
          label="نقاط ممنوحة"
          value={stats.gamification.totalPointsAwarded}
          href="/admin/community/gamification"
        />
      </div>

      {/* Engagement + segments */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <p className="mb-3 text-sm font-semibold text-foreground">النشاط خلال الفترة</p>
          {trendsQuery.isPending ? (
            <div className="h-[260px] animate-pulse rounded-xl bg-surface-2" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={engagementData}>
                <defs>
                  <linearGradient id="ov-signups" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS[0]} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: 'rgb(var(--muted-foreground))' }}
                  axisLine={{ stroke: 'rgb(var(--border))' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'rgb(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  width={28}
                />
                <RTooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="تسجيلات" stroke={CHART_COLORS[0]} strokeWidth={2} fill="url(#ov-signups)" />
                <Line type="monotone" dataKey="منشورات" stroke={CHART_COLORS[1]} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="رسائل الدردشة" stroke={CHART_COLORS[2]} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">التوزيع</p>
            <Segmented
              size="sm"
              value={segView}
              onChange={(v) => setSegView(v as SegmentView)}
              options={[
                { value: 'roles', label: 'الأدوار' },
                { value: 'departments', label: 'الشُعب' },
              ]}
            />
          </div>
          <ResponsiveContainer width="100%" height={170}>
            <PieChart>
              <Pie data={segData} dataKey="value" nameKey="name" innerRadius={42} outerRadius={68} paddingAngle={2}>
                {segData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <RTooltip contentStyle={TOOLTIP_STYLE} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {segData.map((d, i) => (
              <span key={d.name} className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                {d.name} ({nf(d.value)})
              </span>
            ))}
          </div>
        </Card>
      </div>

      {/* Heatmap + needs attention */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <p className="mb-3 text-sm font-semibold text-foreground">تسجيلات آخر ٩٠ يومًا</p>
          {heatQuery.data ? (
            <Heatmap data={heatQuery.data.signups.series} />
          ) : (
            <div className="h-24 animate-pulse rounded-xl bg-surface-2" />
          )}
        </Card>

        <Card className="p-4">
          <p className="mb-3 text-sm font-semibold text-foreground">يحتاج انتباهك</p>
          <ul className="space-y-1">
            {attentionRows.map((row) => (
              <li key={row.label}>
                <Link
                  href={row.href}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-surface-2"
                >
                  <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', row.tone)}>
                    <row.icon className="h-4 w-4" />
                  </span>
                  <span className="flex-1 truncate text-[13px] text-foreground">{row.label}</span>
                  <span
                    className={cn(
                      'text-sm font-bold tabular-nums',
                      row.count > 0 ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {nf(row.count)}
                  </span>
                  <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Leaderboard + live feed */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Trophy className="h-4 w-4 text-gold" />
            المتصدرون
          </p>
          {!leaderboardQuery.data || leaderboardQuery.data.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">لا توجد بيانات بعد.</p>
          ) : (
            <ul className="space-y-1.5">
              {leaderboardQuery.data.map((entry, i) => (
                <li key={entry._id} className="flex items-center gap-2.5 rounded-lg px-1 py-1">
                  <span className="w-4 text-center text-xs font-semibold text-muted-foreground">{nf(i + 1)}</span>
                  <Avatar src={assetUrl(entry.photoUrl)} name={entry.name} size="sm" />
                  <p className="min-w-0 flex-1 truncate text-[13px] text-foreground">{entry.name}</p>
                  <span className="text-xs font-semibold tabular-nums text-accent">{nf(entry.points)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Activity className="h-4 w-4 text-accent" />
            نشاط مباشر
          </p>
          {activity.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">بانتظار أحداث جديدة…</p>
          ) : (
            <ul className="max-h-64 space-y-1.5 overflow-y-auto scrollbar-thin">
              <AnimatePresence initial={false}>
                {activity.map((event, i) => (
                  <motion.li
                    key={`${event.at}-${i}`}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={transitions.snappy}
                    className="flex items-start gap-2 text-[13px]"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <div className="min-w-0">
                      <p className="truncate text-foreground">{event.summary}</p>
                      <p className="text-xs text-muted-foreground">
                        {ACTIVITY_LABEL[event.type]} · {timeAgo(event.at)}
                      </p>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
