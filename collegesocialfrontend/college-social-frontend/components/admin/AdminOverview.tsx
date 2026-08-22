'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, MailWarning, MessageSquareText, Radio, Trophy, Users } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Spinner } from '@/components/ui/Spinner';
import { StatTile } from './AdminStats';
import { api } from '@/lib/api';
import { useSocket } from '@/lib/socket-context';
import { assetUrl, cn, timeAgo } from '@/lib/utils';
import { DEPARTMENT_LABELS } from '@/lib/departments';
import { ROLE_LABELS, type AdminActivityEvent, type AdminStats, type LeaderboardEntry } from '@/lib/types';

// Semantic theme tokens (see app/globals.css) resolved as CSS color strings so charts stay
// correct in both light/dark without any client-side theme detection.
const CHART_COLORS = [
  'rgb(var(--accent))',
  'rgb(var(--accent-2))',
  'rgb(var(--gold))',
  'rgb(var(--success))',
  'rgb(var(--warning))',
  'rgb(var(--danger))',
];

const ACTIVITY_LABEL: Record<AdminActivityEvent['type'], string> = {
  signup: 'تسجيل جديد',
  post: 'منشور جديد',
  moderation: 'إجراء إداري',
};

export function AdminOverview({ onViewPendingVerifications }: { onViewPendingVerifications?: () => void }) {
  const { socket } = useSocket();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlineNow, setOnlineNow] = useState<number | null>(null);
  const [activity, setActivity] = useState<AdminActivityEvent[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.get<AdminStats>('/admin/stats'), api.get<LeaderboardEntry[]>('/admin/gamification/leaderboard?limit=5')])
      .then(([s, l]) => {
        if (cancelled) return;
        setStats(s);
        setOnlineNow(s.users.online);
        setLeaderboard(l);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onPresence = (payload: { online: number }) => setOnlineNow(payload.online);
    const onActivity = (event: AdminActivityEvent) => setActivity((prev) => [event, ...prev].slice(0, 20));
    socket.on('admin:presence', onPresence);
    socket.on('admin:activity', onActivity);
    return () => {
      socket.off('admin:presence', onPresence);
      socket.off('admin:activity', onActivity);
    };
  }, [socket]);

  const trendData = useMemo(() => {
    if (!stats) return [];
    const { dailySignups } = stats.users;
    const { dailyPosts } = stats.posts;
    const { dailyAttempts } = stats.quizzes;
    return dailySignups.map((d, i) => ({
      date: d.date.slice(5),
      تسجيلات: d.count,
      منشورات: dailyPosts[i]?.count ?? 0,
      محاولات_اختبارات: dailyAttempts[i]?.count ?? 0,
    }));
  }, [stats]);

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
    return Object.entries(stats.users.byDepartment).map(([dept, count]) => ({
      name: DEPARTMENT_LABELS[dept as keyof typeof DEPARTMENT_LABELS] ?? dept,
      value: count,
    }));
  }, [stats]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (!stats) {
    return <p className="py-16 text-center text-sm text-muted-foreground">تعذّر تحميل النظرة العامة.</p>;
  }

  const pendingVerifications = Math.max(0, stats.users.total - stats.users.verified);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Card className="flex items-center gap-3 p-4">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
            <Radio className="h-5 w-5" />
            <span className="absolute -top-0.5 end-0 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-surface animate-pulse" />
          </div>
          <div className="min-w-0">
            <p className="text-xl font-semibold text-foreground">{(onlineNow ?? 0).toLocaleString('ar-EG')}</p>
            <p className="truncate text-xs text-muted-foreground">متصلون الآن</p>
          </div>
        </Card>
        <StatTile icon={Users} label="إجمالي المستخدمين" value={stats.users.total} />
        <button
          onClick={onViewPendingVerifications}
          disabled={!onViewPendingVerifications}
          className="block text-start"
        >
          <Card
            className={cn(
              'flex items-center gap-3 p-4 transition-colors',
              pendingVerifications > 0 && 'border-warning/30 bg-warning/5',
              onViewPendingVerifications && 'hover:bg-surface-2',
            )}
          >
            <div
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
                pendingVerifications > 0 ? 'bg-warning/10 text-warning' : 'bg-accent/10 text-accent',
              )}
            >
              <MailWarning className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-semibold text-foreground">{pendingVerifications.toLocaleString('ar-EG')}</p>
              <p className="truncate text-xs text-muted-foreground">بريد بانتظار التوثيق</p>
            </div>
          </Card>
        </button>
        <StatTile icon={MessageSquareText} label="المنشورات" value={stats.posts.totalPosts} />
        <StatTile icon={Activity} label="رسائل الدردشة" value={stats.chat.totalMessages} />
        <StatTile icon={Trophy} label="نقاط ممنوحة" value={stats.gamification.totalPointsAwarded} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <p className="mb-3 text-sm font-medium text-foreground">النشاط خلال 14 يومًا</p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'rgb(var(--muted-foreground))' }} axisLine={{ stroke: 'rgb(var(--border))' }} />
              <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--muted-foreground))' }} axisLine={{ stroke: 'rgb(var(--border))' }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--border))', borderRadius: 8, fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="تسجيلات" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="منشورات" stroke={CHART_COLORS[1]} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="محاولات_اختبارات" stroke={CHART_COLORS[2]} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <p className="mb-3 text-sm font-medium text-foreground">توزيع الأدوار</p>
          <ResponsiveContainer width="100%" height={120}>
            <PieChart>
              <Pie data={roleData} dataKey="value" nameKey="name" innerRadius={30} outerRadius={50} paddingAngle={2}>
                {roleData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--border))', borderRadius: 8, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {roleData.map((d, i) => (
              <span key={d.name} className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                {d.name} ({d.value})
              </span>
            ))}
          </div>

          {departmentData.length > 0 && (
            <>
              <p className="mb-2 mt-4 text-sm font-medium text-foreground">توزيع الشُعب</p>
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <Pie data={departmentData} dataKey="value" nameKey="name" innerRadius={30} outerRadius={50} paddingAngle={2}>
                    {departmentData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[(i + 3) % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--border))', borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {departmentData.map((d, i) => (
                  <span key={d.name} className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ background: CHART_COLORS[(i + 3) % CHART_COLORS.length] }} />
                    {d.name} ({d.value})
                  </span>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <p className="mb-3 flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Trophy className="h-4 w-4 text-gold" />
            المتصدرون
          </p>
          {leaderboard.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">لا توجد بيانات بعد.</p>
          ) : (
            <ul className="space-y-2">
              {leaderboard.map((entry, i) => (
                <li key={entry._id} className="flex items-center gap-2.5">
                  <span className="w-4 text-xs text-muted-foreground">{i + 1}</span>
                  <Avatar src={assetUrl(entry.photoUrl)} name={entry.name} size="sm" />
                  <p className="min-w-0 flex-1 truncate text-sm text-foreground">{entry.name}</p>
                  <span className="text-xs font-medium text-accent">{entry.points.toLocaleString('ar-EG')}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <p className="mb-3 flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Activity className="h-4 w-4 text-accent" />
            نشاط مباشر
          </p>
          {activity.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">بانتظار أحداث جديدة...</p>
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto scrollbar-thin">
              {activity.map((event, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <div className="min-w-0">
                    <p className="truncate text-foreground">{event.summary}</p>
                    <p className="text-xs text-muted-foreground">
                      {ACTIVITY_LABEL[event.type]} &middot; {timeAgo(event.at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
