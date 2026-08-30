'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CalendarCheck, Flame, GraduationCap, Sparkles, TrendingUp } from 'lucide-react';
import type { ComponentType } from 'react';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { gpaTone } from '@/lib/gpa';
import { cn } from '@/lib/utils';
import type { Assignment, AttendanceSummary, GpaResponse } from '@/lib/types';

// Semantic tokens resolved as CSS strings so charts track the theme with no client-side
// detection -- same convention as components/admin/AdminOverview.tsx.
const TOKEN = {
  accent: 'rgb(var(--accent))',
  success: 'rgb(var(--success))',
  warning: 'rgb(var(--warning))',
  danger: 'rgb(var(--danger))',
  muted: 'rgb(var(--muted-foreground))',
  border: 'rgb(var(--border))',
  surface: 'rgb(var(--surface))',
} as const;

const TOOLTIP_STYLE = {
  background: TOKEN.surface,
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 10,
  fontSize: 12,
} as const;

const AXIS_TICK = { fontSize: 11, fill: TOKEN.muted } as const;

// Attendance is a status measure, not a series -- reserved colours, and the bar carries a
// visible % label so it never reads by colour alone.
function attendanceColor(percent: number): string {
  if (percent >= 75) return TOKEN.success;
  if (percent >= 50) return TOKEN.warning;
  return TOKEN.danger;
}

const GPA_TONE_CLASS: Record<ReturnType<typeof gpaTone>, string> = {
  good: 'text-success',
  ok: 'text-warning',
  low: 'text-danger',
};

export function ProgressDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [gpa, setGpa] = useState<GpaResponse | null>(null);
  const [attendance, setAttendance] = useState<AttendanceSummary | null>(null);
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      api.get<GpaResponse>('/gpa'),
      api.get<AttendanceSummary>('/attendance/summary'),
      api.get<Assignment[]>('/assignments?limit=100'),
    ]).then(([g, a, asg]) => {
      if (cancelled) return;
      if (g.status === 'fulfilled') setGpa(g.value);
      if (a.status === 'fulfilled') setAttendance(a.value);
      if (asg.status === 'fulfilled') setAssignments(asg.value);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const termData = useMemo(
    () => (gpa?.summary.terms ?? []).map((t) => ({ term: t.term, gpa: t.gpa })),
    [gpa],
  );

  const attData = useMemo(
    () =>
      (attendance?.courses ?? [])
        .filter((c) => c.counted > 0)
        .map((c) => ({ courseName: c.courseName, percent: c.percent }))
        .sort((a, b) => b.percent - a.percent),
    [attendance],
  );

  const assignmentBreakdown = useMemo(() => {
    if (!assignments || !user) return null;
    const now = Date.now();
    let done = 0;
    let pending = 0;
    let overdue = 0;
    for (const a of assignments) {
      if (a.isPersonal || a.isMilitary) continue;
      if (a.completedBy.includes(user._id)) done += 1;
      else if (new Date(a.dueDate).getTime() < now) overdue += 1;
      else pending += 1;
    }
    return { done, pending, overdue, total: done + pending + overdue };
  }, [assignments, user]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const cumulativeGpa = gpa?.summary.cumulative.gpa ?? null;
  const overallAttendance =
    attendance && attendance.overall.counted > 0 ? attendance.overall.percent : null;

  return (
    <div className="space-y-5">
      {/* Hero stats -- headline numbers, not charts. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          icon={GraduationCap}
          label="المعدل التراكمي"
          value={cumulativeGpa === null ? '—' : cumulativeGpa.toFixed(2)}
          valueClass={cumulativeGpa === null ? undefined : GPA_TONE_CLASS[gpaTone(cumulativeGpa)]}
          hint={gpa ? `${gpa.summary.gradedCredits} ساعة محتسبة` : undefined}
        />
        <StatTile
          icon={CalendarCheck}
          label="نسبة الحضور"
          value={overallAttendance === null ? '—' : `${overallAttendance}%`}
          valueClass={overallAttendance === null ? undefined : GPA_TONE_CLASS[
            overallAttendance >= 75 ? 'good' : overallAttendance >= 50 ? 'ok' : 'low'
          ]}
          hint={attendance && attendance.overall.counted > 0 ? `${attendance.overall.counted} حصة` : undefined}
        />
        <StatTile icon={Sparkles} label="النقاط" value={String(user?.points ?? 0)} />
        <StatTile icon={Flame} label="سلسلة الأيام" value={String(user?.streakCount ?? 0)} />
      </div>

      {/* GPA per term */}
      <Card className="p-4">
        <SectionHeader icon={TrendingUp} title="المعدل الفصلي" />
        {termData.length >= 2 ? (
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={termData} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={TOKEN.border} />
                <XAxis dataKey="term" tick={AXIS_TICK} axisLine={{ stroke: TOKEN.border }} tickLine={false} />
                <YAxis domain={[0, 4]} ticks={[0, 1, 2, 3, 4]} tick={AXIS_TICK} axisLine={false} tickLine={false} width={28} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [Number(v).toFixed(2), 'المعدل']} />
                <Line
                  type="monotone"
                  dataKey="gpa"
                  stroke={TOKEN.accent}
                  strokeWidth={2}
                  dot={{ r: 3, fill: TOKEN.accent }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyHint
            text={
              termData.length === 1
                ? 'أضف مواد لفصل آخر في «حساب المعدل» لرؤية تغيّر معدلك عبر الفصول.'
                : 'لا توجد بيانات معدل بعد.'
            }
            href="/study/gpa"
            cta="فتح حساب المعدل"
          />
        )}
      </Card>

      {/* Attendance by course */}
      <Card className="p-4">
        <SectionHeader icon={CalendarCheck} title="الحضور حسب المقرر" />
        {attData.length > 0 ? (
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={Math.max(140, attData.length * 40 + 24)}>
              <BarChart data={attData} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 8 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke={TOKEN.border} />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={AXIS_TICK}
                  axisLine={{ stroke: TOKEN.border }}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="courseName"
                  width={96}
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip cursor={{ fill: 'rgb(var(--surface-2))' }} contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}%`, 'الحضور']} />
                <Bar dataKey="percent" radius={[0, 4, 4, 0]} barSize={16}>
                  {attData.map((d, i) => (
                    <Cell key={i} fill={attendanceColor(d.percent)} />
                  ))}
                  <LabelList
                    dataKey="percent"
                    position="right"
                    formatter={(v) => `${v}%`}
                    style={{ fontSize: 11, fill: TOKEN.muted }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyHint text="لم تسجّل أي حضور بعد." href="/study/attendance" cta="فتح متتبّع الحضور" />
        )}
      </Card>

      {/* Assignments breakdown */}
      <Card className="p-4">
        <SectionHeader icon={GraduationCap} title="الواجبات" />
        {assignmentBreakdown && assignmentBreakdown.total > 0 ? (
          <AssignmentsDonut breakdown={assignmentBreakdown} />
        ) : (
          <EmptyHint text="لا توجد واجبات على لوحتك بعد." href="/study/assignments" cta="فتح الواجبات" />
        )}
      </Card>
    </div>
  );
}

/* -------------------------------- pieces --------------------------------- */

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  valueClass,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/80 bg-surface p-3.5 shadow-elev-1">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className={cn('mt-1.5 text-xl font-bold tracking-tight text-foreground', valueClass)}>
        <bdi dir="ltr">{value}</bdi>
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function EmptyHint({ text, href, cta }: { text: string; href: string; cta: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
      <Link href={href} className="text-xs font-medium text-accent hover:underline">
        {cta}
      </Link>
    </div>
  );
}

function AssignmentsDonut({
  breakdown,
}: {
  breakdown: { done: number; pending: number; overdue: number; total: number };
}) {
  const slices = [
    { name: 'مكتمل', value: breakdown.done, color: TOKEN.success },
    { name: 'قيد الإنجاز', value: breakdown.pending, color: TOKEN.accent },
    { name: 'متأخر', value: breakdown.overdue, color: TOKEN.danger },
  ].filter((s) => s.value > 0);

  const donePct = Math.round((breakdown.done / breakdown.total) * 100);

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
      <div dir="ltr" className="relative h-[132px] w-[132px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius={44}
              outerRadius={62}
              paddingAngle={slices.length > 1 ? 2 : 0}
              stroke="none"
            >
              {slices.map((s, i) => (
                <Cell key={i} fill={s.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-foreground">
            <bdi dir="ltr">{donePct}%</bdi>
          </span>
          <span className="text-[10px] text-muted-foreground">مكتمل</span>
        </div>
      </div>
      <ul className="w-full space-y-1.5">
        {[
          { name: 'مكتمل', value: breakdown.done, color: TOKEN.success },
          { name: 'قيد الإنجاز', value: breakdown.pending, color: TOKEN.accent },
          { name: 'متأخر', value: breakdown.overdue, color: TOKEN.danger },
        ].map((s) => (
          <li key={s.name} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="flex-1 text-muted-foreground">{s.name}</span>
            <span className="font-semibold text-foreground">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
