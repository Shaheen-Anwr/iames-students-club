'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { CalendarRange, Clock, Flame, MapPin, Shield, Upload, Users, ChevronDown } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { assetUrl, cn } from '@/lib/utils';
import type { MilitaryOverview, MilitaryRoster, MilitaryStatus } from '@/lib/types';
import { AssignmentsBoard } from './AssignmentsBoard';
import { MilitaryPeriodForm } from './MilitaryPeriodForm';
import { MilitaryScheduleUpload } from './MilitaryScheduleUpload';
import { MilitaryRosterUpload } from './MilitaryRosterUpload';
import { MilitaryTodoList } from './MilitaryTodoList';

function fmtDate(iso: string) {
  return format(new Date(iso), 'd MMMM yyyy', { locale: ar });
}

function fmtDay(iso: string) {
  return format(new Date(iso), 'EEEE d MMMM', { locale: ar });
}

export function MilitaryHub() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isStaff = user?.role === 'admin' || user?.role === 'professor';
  const isAdmin = user?.role === 'admin';

  const [overview, setOverview] = useState<MilitaryOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [periodModalOpen, setPeriodModalOpen] = useState(false);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [rosterModalOpen, setRosterModalOpen] = useState(false);

  const [fromTime, setFromTime] = useState('');
  const [toTime, setToTime] = useState('');
  const [savingTime, setSavingTime] = useState(false);

  const [rosterOpen, setRosterOpen] = useState(false);
  const [roster, setRoster] = useState<MilitaryRoster | null>(null);
  const [rosterLoading, setRosterLoading] = useState(false);

  function ingest(o: MilitaryOverview) {
    setOverview(o);
    setFromTime(o.settings?.dailyStartTime ?? '');
    setToTime(o.settings?.dailyEndTime ?? '');
  }

  useEffect(() => {
    let mounted = true;
    api
      .get<MilitaryOverview>('/military')
      .then((res) => mounted && ingest(res))
      .catch(() => mounted && setOverview(null))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  async function refreshOverview() {
    try {
      ingest(await api.get<MilitaryOverview>('/military'));
    } catch {
      /* keep the current view */
    }
  }

  function applyStatus(status: MilitaryStatus) {
    setOverview((prev) => (prev ? { ...prev, period: status.period, myStatus: status } : prev));
  }

  async function handleCheckIn() {
    setCheckingIn(true);
    try {
      applyStatus(await api.post<MilitaryStatus>('/military/checkin'));
      showToast('تم تسجيل حضورك اليوم.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر تسجيل الحضور.', 'error');
    } finally {
      setCheckingIn(false);
    }
  }

  async function saveTime() {
    if (fromTime && toTime && fromTime >= toTime) {
      showToast('وقت النهاية يجب أن يكون بعد وقت البداية.', 'error');
      return;
    }
    setSavingTime(true);
    try {
      await api.patch('/military/settings', { dailyStartTime: fromTime || null, dailyEndTime: toTime || null });
      setOverview((prev) => (prev ? { ...prev, settings: { dailyStartTime: fromTime || null, dailyEndTime: toTime || null } } : prev));
      showToast('تم حفظ وقتك اليومي.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر الحفظ.', 'error');
    } finally {
      setSavingTime(false);
    }
  }

  async function loadRoster() {
    setRosterLoading(true);
    try {
      setRoster(await api.get<MilitaryRoster>('/military/roster'));
    } catch {
      showToast('تعذّر تحميل متابعة الطلاب.', 'error');
    } finally {
      setRosterLoading(false);
    }
  }

  async function toggleRoster() {
    const next = !rosterOpen;
    setRosterOpen(next);
    if (next && !roster) void loadRoster();
  }

  function handleRosterUploaded() {
    // Refetch now if the panel is already open, otherwise drop the cache so it reloads on expand.
    if (rosterOpen) void loadRoster();
    else setRoster(null);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const period = overview?.period ?? null;
  const status = overview?.myStatus;
  const schedule = overview?.schedule ?? [];
  const todos = overview?.todos ?? [];
  const progress = status && status.daysTotal > 0 ? Math.min(100, Math.round((status.daysElapsed / status.daysTotal) * 100)) : 0;
  const timeDirty = fromTime !== (overview?.settings?.dailyStartTime ?? '') || toTime !== (overview?.settings?.dailyEndTime ?? '');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="me-auto flex items-center gap-2 text-lg font-semibold text-foreground">
          <Shield className="h-5 w-5 text-accent" />
          التربية العسكرية
        </h1>
        {isAdmin && (
          <>
            <Button size="sm" variant="outline" onClick={() => setRosterModalOpen(true)}>
              <Users className="h-4 w-4" />
              رفع كشف الطلاب
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCsvModalOpen(true)}>
              <Upload className="h-4 w-4" />
              رفع جدول CSV
            </Button>
            <Button size="sm" variant={period ? 'outline' : 'primary'} onClick={() => setPeriodModalOpen(true)}>
              {period ? 'التحفيز والموعد' : 'تحديد الموعد'}
            </Button>
          </>
        )}
      </div>

      {/* Period card */}
      {period ? (
        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CalendarRange className="h-4 w-4 text-accent" />
            {period.title}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span>من</span>
            <span className="font-medium text-foreground">{fmtDate(period.startDate)}</span>
            <span>إلى</span>
            <span className="font-medium text-foreground">{fmtDate(period.endDate)}</span>
          </div>
          <div className="space-y-1.5">
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-gradient-accent transition-[width]" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                اليوم {Math.max(status?.daysElapsed ?? 0, 0)} من {status?.daysTotal ?? 0}
              </span>
              <span>{status?.daysRemaining ? `متبقٍ ${status.daysRemaining} يوم` : 'انتهى البرنامج'}</span>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="flex flex-col items-center gap-3 border-dashed p-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent">
            <CalendarRange className="h-7 w-7" />
          </div>
          <p className="text-sm font-medium text-foreground">لم يُحدَّد موعد التربية العسكرية بعد</p>
          {isAdmin ? (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setCsvModalOpen(true)}>
                رفع جدول CSV
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPeriodModalOpen(true)}>
                إدخال يدوي
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">سيظهر هنا موعد البرنامج بمجرد نشره من إدارة الكلية.</p>
          )}
        </Card>
      )}

      {/* Streak + motivation */}
      {period && status && (
        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-4">
            <div
              className={cn(
                'flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl',
                status.streak > 0 ? 'bg-warning/15 text-warning' : 'bg-surface-2 text-muted-foreground',
              )}
            >
              <Flame className="h-5 w-5" />
              <span className="text-lg font-bold leading-none">{status.streak}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">أيام متتالية من الحضور</p>
              <p className="text-xs text-muted-foreground">إجمالي أيام حضورك: {status.totalCheckIns}</p>
            </div>
          </div>

          {status.quote && (
            <p className="rounded-xl2 bg-surface-2/70 px-4 py-3 text-sm leading-relaxed text-foreground">“{status.quote}”</p>
          )}

          <Button fullWidth loading={checkingIn} disabled={status.checkedInToday || !status.isActive} onClick={handleCheckIn}>
            {status.checkedInToday
              ? 'تم تسجيل حضورك اليوم ✓'
              : !status.isActive
                ? 'التسجيل متاح خلال أيام البرنامج فقط'
                : 'سجّل حضور اليوم'}
          </Button>
        </Card>
      )}

      {/* Student's own daily time window */}
      {!isStaff && (
        <Card className="space-y-3 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Clock className="h-4 w-4 text-accent" />
            وقتي اليومي
          </div>
          <p className="text-xs text-muted-foreground">حدّد ساعات حضورك اليومية للتربية العسكرية.</p>
          <div className="flex flex-wrap items-end gap-3">
            <Input label="من" type="time" value={fromTime} onChange={(e) => setFromTime(e.target.value)} className="w-32" />
            <Input label="إلى" type="time" value={toTime} onChange={(e) => setToTime(e.target.value)} className="w-32" />
            <Button size="sm" loading={savingTime} disabled={!timeDirty} onClick={saveTime}>
              حفظ
            </Button>
          </div>
        </Card>
      )}

      {/* Program schedule (from the admin CSV) */}
      {(schedule.length > 0 || isAdmin) && (
        <Card className="space-y-3 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CalendarRange className="h-4 w-4 text-accent" />
            جدول البرنامج
          </div>
          {schedule.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">
              لا يوجد جدول بعد. {isAdmin ? 'ارفع ملف CSV لإضافة الجلسات.' : ''}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {schedule.map((s) => (
                <li key={s._id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                  <span className="min-w-[7.5rem] font-medium text-foreground">{fmtDay(s.date)}</span>
                  <span className="text-muted-foreground" dir="ltr">
                    {s.startTime} - {s.endTime}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{s.title}</span>
                  {s.location && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {s.location}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* Student's private to-do list */}
      <MilitaryTodoList initialTodos={todos} />

      {/* Staff roster */}
      {isStaff && (
        <Card className="overflow-hidden">
          <button
            type="button"
            onClick={toggleRoster}
            className="flex w-full items-center gap-2 px-5 py-4 text-sm font-semibold text-foreground"
          >
            <Users className="h-4 w-4 text-accent" />
            متابعة الطلاب
            <ChevronDown className={cn('ms-auto h-4 w-4 transition-transform', rosterOpen && 'rotate-180')} />
          </button>
          {rosterOpen && (
            <div className="border-t border-border/70 px-2 pb-2">
              {roster && roster.rosterCount > 0 && (
                <p className="px-2 pt-2 text-xs text-muted-foreground">
                  الكشف المرفوع: {roster.rosterCount} اسمًا · مطابَق {roster.students.length}
                </p>
              )}
              {roster && roster.unmatchedNames.length > 0 && (
                <div className="m-2 rounded-xl2 bg-warning/10 p-3 text-xs">
                  <p className="mb-1.5 font-medium text-warning">
                    {roster.unmatchedNames.length} اسمًا في الكشف بلا حساب مطابق:
                  </p>
                  <ul className="max-h-32 space-y-0.5 overflow-y-auto text-muted-foreground">
                    {roster.unmatchedNames.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}
              {rosterLoading ? (
                <div className="flex justify-center py-8">
                  <Spinner className="h-5 w-5" />
                </div>
              ) : !roster || roster.students.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">لا يوجد طلاب لعرضهم.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground">
                        <th className="p-2 text-start font-medium">الطالب</th>
                        <th className="p-2 text-center font-medium">الواجبات</th>
                        <th className="p-2 text-center font-medium">أيام الحضور</th>
                        <th className="p-2 text-center font-medium">التتابع</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roster.students.map((row) => (
                        <tr key={row.user._id} className="border-t border-border/70">
                          <td className="p-2">
                            <div className="flex items-center gap-2">
                              <Avatar src={assetUrl(row.user.photoUrl)} name={row.user.name} size="xs" />
                              <div className="min-w-0">
                                <p className="truncate font-medium text-foreground">{row.user.name}</p>
                                <p dir="ltr" className="truncate text-start text-xs text-muted-foreground">
                                  {row.user.collegeId}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="p-2 text-center tabular-nums">
                            {row.completed}/{row.total}
                          </td>
                          <td className="p-2 text-center tabular-nums">{row.attendedDays}</td>
                          <td className="p-2 text-center tabular-nums">{row.streak}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Broadcast military assignments */}
      <AssignmentsBoard military />

      {isAdmin && (
        <>
          <Modal
            open={periodModalOpen}
            onClose={() => setPeriodModalOpen(false)}
            title={period ? 'تعديل موعد التربية العسكرية' : 'تحديد موعد التربية العسكرية'}
          >
            <MilitaryPeriodForm period={period} onSaved={() => void refreshOverview()} onClose={() => setPeriodModalOpen(false)} />
          </Modal>
          <Modal open={csvModalOpen} onClose={() => setCsvModalOpen(false)} title="رفع جدول التربية العسكرية">
            <MilitaryScheduleUpload onUploaded={() => void refreshOverview()} onClose={() => setCsvModalOpen(false)} />
          </Modal>
          <Modal open={rosterModalOpen} onClose={() => setRosterModalOpen(false)} title="رفع كشف طلاب الوحدة">
            <MilitaryRosterUpload onUploaded={handleRosterUploaded} onClose={() => setRosterModalOpen(false)} />
          </Modal>
        </>
      )}
    </div>
  );
}
