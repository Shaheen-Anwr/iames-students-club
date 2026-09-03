'use client';

import { useState } from 'react';
import { Award, Flame, Sparkles, X } from 'lucide-react';
import { ShareButton } from '@/components/shared/ShareButton';
import { useAuth } from '@/lib/auth-context';
import { useWeeklyRecap } from '@/lib/gamification';
import { absoluteUrl } from '@/lib/share';

// Shows last week's recap on the home feed during the first two days of a new week (Sat/Sun),
// once per week per device (dismissed state keyed by the recap's weekStart). Renders nothing
// otherwise, or when the student had no activity last week.
function isNewWeekWindow(): boolean {
  const d = new Date().getDay(); // 0=Sun .. 6=Sat
  return d === 6 || d === 0;
}

export function WeeklyRecapCard() {
  const { user } = useAuth();
  const inWindow = isNewWeekWindow();
  const { data: recap } = useWeeklyRecap(!!user && inWindow);
  const [dismissed, setDismissed] = useState(false);

  if (!inWindow || !recap || recap.totalPoints <= 0) return null;

  const storeKey = `seen-recap:${user?._id}:${recap.weekStart.slice(0, 10)}`;
  if (typeof window !== 'undefined') {
    try {
      if (window.localStorage.getItem(storeKey) === '1') return null;
    } catch {
      /* ignore */
    }
  }
  if (dismissed) return null;

  function close() {
    setDismissed(true);
    try {
      window.localStorage.setItem(storeKey, '1');
    } catch {
      /* ignore */
    }
  }

  const stats: { label: string; value: number }[] = [
    { label: 'أيام نشاط', value: recap.activeDays },
    { label: 'منشورات', value: recap.posts },
    { label: 'تعليقات', value: recap.comments },
    { label: 'واجبات', value: recap.assignments },
    { label: 'اختبارات', value: recap.quizzes },
  ].filter((s) => s.value > 0);

  const shareText =
    `كسبت ${recap.totalPoints} نقطة هذا الأسبوع في IAEMS` +
    (recap.streakCount > 0 ? ` · سلسلة ${recap.streakCount} يومًا 🔥` : '') +
    (recap.deptRank ? ` · ترتيبي #${recap.deptRank} في شعبتي` : '');

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-surface p-5 shadow-elev-1">
      <div className="bg-mesh pointer-events-none absolute inset-0 opacity-50" />
      <button
        type="button"
        onClick={close}
        aria-label="إخفاء"
        className="absolute end-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="relative">
        <p className="text-xs font-medium text-muted-foreground">أسبوعك في IAEMS</p>
        <div className="mt-1 flex flex-wrap items-end gap-x-4 gap-y-1">
          <span className="flex items-baseline gap-1.5 text-2xl font-extrabold tracking-tight text-foreground">
            <Sparkles className="h-5 w-5 text-accent" />
            {recap.totalPoints}
            <span className="text-sm font-medium text-muted-foreground">نقطة</span>
          </span>
          {recap.streakCount > 0 && (
            <span className="flex items-center gap-1 text-sm font-semibold text-warning">
              <Flame className="h-4 w-4 fill-warning/30" />
              {recap.streakCount} يوم متتالي
            </span>
          )}
          {recap.deptRank != null && (
            <span className="flex items-center gap-1 text-sm font-semibold text-gold">
              <Award className="h-4 w-4" />
              #{recap.deptRank} في شعبتك
            </span>
          )}
        </div>

        {stats.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {stats.map((s) => (
              <span
                key={s.label}
                className="rounded-full border border-border/60 bg-surface-2/60 px-2.5 py-1 text-[11px] text-muted-foreground"
              >
                <b className="text-foreground">{s.value}</b> {s.label}
              </span>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {recap.freezesUsed > 0
              ? `استُخدم تجميد سلسلة ${recap.freezesUsed} مرة — سلسلتك سليمة.`
              : 'سباق جديد بدأ. واصل النشاط لتتصدّر شعبتك.'}
          </p>
          <ShareButton
            variant="pill"
            label="شارك"
            heading="أسبوعك في IAEMS"
            title="أسبوعي في IAEMS"
            text={shareText}
            url={absoluteUrl('/')}
          />
        </div>
      </div>
    </div>
  );
}
