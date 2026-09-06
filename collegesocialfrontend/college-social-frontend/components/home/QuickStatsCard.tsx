'use client';

import { CalendarCheck, Flame, GraduationCap, Sparkles, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatTile } from '@/components/study/ProgressDashboard';
import { useAuth } from '@/lib/auth-context';
import { useRawQuery } from '@/lib/query';
import { gpaTone } from '@/lib/gpa';
import type { AttendanceSummary, GpaResponse } from '@/lib/types';

const TONE_CLASS: Record<ReturnType<typeof gpaTone>, string> = {
  good: 'text-success',
  ok: 'text-warning',
  low: 'text-danger',
};

// The same headline GPA/attendance/points/streak tiles as /study/dashboard's ProgressDashboard,
// reused here (same StatTile component) so a student doesn't have to leave /home for a quick
// glance. Same backend aggregate (already server-cached ~30s), independently fetched.
export function QuickStatsCard() {
  const { user } = useAuth();
  const { data } = useRawQuery<{ gpa: GpaResponse | null; attendance: AttendanceSummary | null }>(
    ['dashboard-study-quickstats'],
    '/dashboard/study',
  );

  const cumulativeGpa = data?.gpa?.summary.cumulative.gpa ?? null;
  const attendance = data?.attendance;
  const overallAttendance = attendance && attendance.overall.counted > 0 ? attendance.overall.percent : null;

  return (
    <Card className="p-4">
      <SectionHeader icon={TrendingUp} title="إحصائياتي" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          icon={GraduationCap}
          label="المعدل التراكمي"
          value={cumulativeGpa === null ? '—' : cumulativeGpa.toFixed(2)}
          valueClass={cumulativeGpa === null ? undefined : TONE_CLASS[gpaTone(cumulativeGpa)]}
        />
        <StatTile
          icon={CalendarCheck}
          label="نسبة الحضور"
          value={overallAttendance === null ? '—' : `${overallAttendance}%`}
          valueClass={overallAttendance === null ? undefined : TONE_CLASS[overallAttendance >= 75 ? 'good' : overallAttendance >= 50 ? 'ok' : 'low']}
        />
        <StatTile icon={Sparkles} label="النقاط" value={String(user?.points ?? 0)} />
        <StatTile icon={Flame} label="سلسلة الأيام" value={String(user?.streakCount ?? 0)} />
      </div>
    </Card>
  );
}
