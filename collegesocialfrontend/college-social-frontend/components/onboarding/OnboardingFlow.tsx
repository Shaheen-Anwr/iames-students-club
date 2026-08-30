'use client';

import { useMemo, useState } from 'react';
import {
  BellRing,
  Bot,
  CalendarHeart,
  Check,
  GraduationCap,
  MessagesSquare,
  Newspaper,
  Sparkles,
  Store,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { isPushSupported, subscribeToPush } from '@/lib/push-notifications';
import { DEPARTMENTS, DEPARTMENT_LABELS, type Department } from '@/lib/departments';
import { ACADEMIC_YEAR_LABELS, getAcademicYearsForDepartment, type AcademicYear } from '@/lib/academic-years';
import { SPECIALIZATIONS_BY_DEPARTMENT, SPECIALIZATION_LABELS, type Specialization } from '@/lib/specializations';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';

const FLAG_PREFIX = 'onboarding:v1:';
const SELECT_CLASS =
  'h-10 w-full rounded-lg border border-border bg-surface-2/70 px-3 text-sm text-foreground focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-50';

const TOUR = [
  { icon: Newspaper, title: 'المنشورات', text: 'شارك وتابع منشورات زملائك وشعبتك.' },
  { icon: GraduationCap, title: 'الدراسة', text: 'جدولك، واجباتك، معدّلك، وحضورك في مكان واحد.' },
  { icon: MessagesSquare, title: 'الجدار', text: 'منشورات مجهولة داخل كليتك.' },
  { icon: CalendarHeart, title: 'الفعاليات', text: 'فعاليات ولقاءات الأندية.' },
  { icon: Store, title: 'السوق', text: 'بيع وشراء الكتب والمستلزمات بين الطلاب.' },
  { icon: Bot, title: 'المساعد الذكي', text: 'اسأل عن أي شيء أو لخّص محاضراتك بالذكاء الاصطناعي.' },
];

function alreadyDone(userId: string): boolean {
  try {
    return localStorage.getItem(FLAG_PREFIX + userId) === '1';
  } catch {
    return true; // storage blocked -> don't nag
  }
}

export function OnboardingFlow() {
  const { user, updateLocalUser } = useAuth();
  const { showToast } = useToast();

  const initiallyDone = useMemo(() => (user ? alreadyDone(user._id) : true), [user]);
  const [open, setOpen] = useState(!initiallyDone);
  const [step, setStep] = useState(0);

  const [department, setDepartment] = useState<Department | ''>(user?.department ?? '');
  const [academicYear, setAcademicYear] = useState<AcademicYear | ''>(user?.academicYear ?? '');
  const [specialization, setSpecialization] = useState<Specialization | ''>(user?.specialization ?? '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushDone, setPushDone] = useState(false);

  if (!user || !open || user.role === 'admin') return null;

  const yearOptions = department ? getAcademicYearsForDepartment(department) : [];
  const specOptions = department ? SPECIALIZATIONS_BY_DEPARTMENT[department] : [];

  function finish() {
    try {
      localStorage.setItem(FLAG_PREFIX + user!._id, '1');
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  async function saveProfile() {
    if (!department) {
      setStep(2);
      return;
    }
    setSavingProfile(true);
    try {
      const updated = await api.patch<User>('/users/me', {
        department,
        academicYear: academicYear || undefined,
        specialization: specialization || undefined,
      });
      updateLocalUser(updated);
      setStep(2);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر الحفظ', 'error');
    } finally {
      setSavingProfile(false);
    }
  }

  async function enablePush() {
    setPushBusy(true);
    try {
      await subscribeToPush();
      setPushDone(true);
      showToast('تم تفعيل الإشعارات', 'success');
    } catch {
      showToast('تعذّر تفعيل الإشعارات', 'error');
    } finally {
      setPushBusy(false);
    }
  }

  const steps = [
    // 0 -- welcome
    <div key="w" className="space-y-3 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-accent text-white shadow-elev-2">
        <Sparkles className="h-7 w-7" />
      </div>
      <h2 className="text-lg font-bold text-foreground">أهلًا بك 👋</h2>
      <p className="text-sm text-muted-foreground">لنُجهّز حسابك في أقل من دقيقة — خطوتان فقط.</p>
    </div>,

    // 1 -- profile
    <div key="p" className="space-y-3">
      <h2 className="text-base font-bold text-foreground">شعبتك وسنتك</h2>
      <p className="text-xs text-muted-foreground">تُستخدم لعرض المنشورات والإعلانات والجدول الخاص بشعبتك.</p>
      <select
        value={department}
        onChange={(e) => {
          setDepartment(e.target.value as Department | '');
          setAcademicYear('');
          setSpecialization('');
        }}
        className={SELECT_CLASS}
      >
        <option value="">اختر الشعبة</option>
        {DEPARTMENTS.map((d) => (
          <option key={d} value={d}>
            {DEPARTMENT_LABELS[d]}
          </option>
        ))}
      </select>
      <select value={academicYear} onChange={(e) => setAcademicYear(e.target.value as AcademicYear | '')} disabled={!department} className={SELECT_CLASS}>
        <option value="">{department ? 'السنة الدراسية (اختياري)' : 'اختر الشعبة أولًا'}</option>
        {yearOptions.map((y) => (
          <option key={y} value={y}>
            {ACADEMIC_YEAR_LABELS[y]}
          </option>
        ))}
      </select>
      {specOptions.length > 0 && (
        <select value={specialization} onChange={(e) => setSpecialization(e.target.value as Specialization | '')} disabled={!department} className={SELECT_CLASS}>
          <option value="">التخصص (اختياري)</option>
          {specOptions.map((s) => (
            <option key={s} value={s}>
              {SPECIALIZATION_LABELS[s]}
            </option>
          ))}
        </select>
      )}
    </div>,

    // 2 -- notifications
    <div key="n" className="space-y-3 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
        <BellRing className="h-7 w-7" />
      </div>
      <h2 className="text-base font-bold text-foreground">الإشعارات</h2>
      <p className="text-sm text-muted-foreground">
        فعّلها لتصلك تنبيهات الواجبات والإعلانات والرسائل حتى عندما يكون التطبيق مغلقًا.
      </p>
      {isPushSupported() ? (
        <Button variant={pushDone ? 'subtle' : 'primary'} onClick={enablePush} loading={pushBusy} disabled={pushDone}>
          {pushDone ? (
            <>
              <Check className="h-4 w-4" /> مُفعّلة
            </>
          ) : (
            'تفعيل الإشعارات'
          )}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">جهازك لا يدعم الإشعارات الفورية.</p>
      )}
    </div>,

    // 3 -- tour
    <div key="t" className="space-y-3">
      <h2 className="text-base font-bold text-foreground">جولة سريعة</h2>
      <ul className="space-y-2">
        {TOUR.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">{title}</span>
              <span className="block text-xs text-muted-foreground">{text}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>,
  ];

  const isLast = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[9000] flex items-end justify-center bg-overlay/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-2xl border border-border bg-surface p-5 shadow-elev-4 sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <span
                key={i}
                className={cn('h-1.5 rounded-full transition-all', i === step ? 'w-5 bg-accent' : 'w-1.5 bg-surface-3')}
              />
            ))}
          </div>
          <button onClick={finish} className="text-xs font-medium text-muted-foreground hover:text-foreground">
            تخطٍّ
          </button>
        </div>

        <div className="min-h-[180px]">{steps[step]}</div>

        <div className="mt-5 flex items-center justify-between gap-3">
          {step > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setStep((s) => s - 1)}>
              رجوع
            </Button>
          ) : (
            <span />
          )}
          {step === 1 ? (
            <Button size="sm" onClick={saveProfile} loading={savingProfile}>
              {department ? 'حفظ ومتابعة' : 'تخطّي'}
            </Button>
          ) : isLast ? (
            <Button size="sm" onClick={finish}>
              ابدأ الآن
            </Button>
          ) : (
            <Button size="sm" onClick={() => setStep((s) => s + 1)}>
              التالي
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
