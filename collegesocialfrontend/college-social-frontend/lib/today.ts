// "Today at a glance" logic for the home screen -- pure functions so both the live
// NextClassCard and the static glance strip / nudge share one source of truth. No React here.

import type { DueItem, ScheduleEntry } from './types';

/** Minutes since midnight for a "HH:MM" 24h string. NaN / malformed -> null. */
export function hhmmToMinutes(hhmm: string | undefined | null): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export type ClassPhase =
  /** A class is running right now. */
  | { kind: 'in-progress'; entry: ScheduleEntry; endsIn: number; progress: number }
  /** No class now, but one is still ahead today. */
  | { kind: 'upcoming'; entry: ScheduleEntry; startsIn: number }
  /** Had classes today, all finished. */
  | { kind: 'done' }
  /** Nothing scheduled today. */
  | { kind: 'none' };

/**
 * Classify where the student is in their teaching day given today's schedule rows (any order)
 * and "now": mid-class, waiting for the next one, done for the day, or a free day.
 */
export function classPhase(schedule: ScheduleEntry[], now: Date = new Date()): ClassPhase {
  if (!schedule.length) return { kind: 'none' };
  const cur = minutesOfDay(now);

  const rows = schedule
    .map((entry) => ({ entry, start: hhmmToMinutes(entry.startTime), end: hhmmToMinutes(entry.endTime) }))
    .filter(
      (r): r is { entry: ScheduleEntry; start: number; end: number } =>
        r.start != null && r.end != null && r.end > r.start,
    )
    .sort((a, b) => a.start - b.start);
  if (!rows.length) return { kind: 'none' };

  const live = rows.find((r) => cur >= r.start && cur < r.end);
  if (live) {
    const span = live.end - live.start;
    return {
      kind: 'in-progress',
      entry: live.entry,
      endsIn: live.end - cur,
      progress: Math.max(0, Math.min(100, Math.round(((cur - live.start) / span) * 100))),
    };
  }

  const next = rows.find((r) => r.start > cur);
  if (next) return { kind: 'upcoming', entry: next.entry, startsIn: next.start - cur };

  return { kind: 'done' };
}

/** Rough Arabic count agreement for small nouns (1 / 2 / 3-10 / 11+). */
export function arCount(n: number, forms: { one: string; two: string; few: string; many: string }): string {
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  if (n >= 3 && n <= 10) return `${n} ${forms.few}`;
  return `${n} ${forms.many}`;
}

/** "ساعتين و10 دقائق" / "45 دقيقة" style duration label for a minute count. */
export function formatMinutes(total: number): string {
  if (total <= 0) return 'الآن';
  const h = Math.floor(total / 60);
  const m = total % 60;
  const hPart = h > 0 ? arCount(h, { one: 'ساعة', two: 'ساعتين', few: 'ساعات', many: 'ساعة' }) : '';
  const mPart = m > 0 ? arCount(m, { one: 'دقيقة', two: 'دقيقتين', few: 'دقائق', many: 'دقيقة' }) : '';
  return [hPart, mPart].filter(Boolean).join(' و') || 'دقيقة';
}

export type NudgeIcon = 'alert' | 'clock' | 'bell' | 'sparkles' | 'flame';

export interface Nudge {
  text: string;
  href: string;
  tone: 'accent' | 'warning' | 'danger' | 'success';
  icon: NudgeIcon;
}

/**
 * Pick the single most useful one-liner for the greeting header, in priority order:
 * overdue work > a class about to start / running > work due today > a pile of unread >
 * keep-your-streak > (quiet day) an encouragement. Deterministic -- no AI call.
 */
export function buildNudge(input: {
  phase: ClassPhase;
  dueToday: DueItem[];
  unreadCount: number;
  streak: number;
}): Nudge {
  const { phase, dueToday, unreadCount, streak } = input;
  const overdue = dueToday.filter((d) => d.urgency === 'overdue');
  const urgent = dueToday.filter((d) => d.urgency === 'urgent');

  if (overdue.length) {
    return {
      text:
        overdue.length === 1
          ? `مهمة متأخرة: «${overdue[0].title}» — أنجزها اليوم`
          : `${arCount(overdue.length, { one: 'مهمة متأخرة', two: 'مهمتان متأخرتان', few: 'مهام متأخرة', many: 'مهمة متأخرة' })} — ابدأ بأقربها موعدًا`,
      href: '/study/assignments',
      tone: 'danger',
      icon: 'alert',
    };
  }

  if (phase.kind === 'upcoming' && phase.startsIn <= 45) {
    const room = phase.entry.location ? ` — القاعة ${phase.entry.location}` : '';
    return {
      text: `«${phase.entry.courseName}» تبدأ بعد ${formatMinutes(phase.startsIn)}${room}`,
      href: '/study/schedule',
      tone: 'warning',
      icon: 'clock',
    };
  }

  if (phase.kind === 'in-progress') {
    return {
      text: `«${phase.entry.courseName}» جارية الآن — تنتهي بعد ${formatMinutes(phase.endsIn)}`,
      href: '/study/schedule',
      tone: 'accent',
      icon: 'clock',
    };
  }

  if (urgent.length) {
    return {
      text: `${arCount(urgent.length, { one: 'مهمة واحدة تستحق', two: 'مهمتان تستحقان', few: 'مهام تستحق', many: 'مهمة تستحق' })} اليوم`,
      href: '/study/assignments',
      tone: 'warning',
      icon: 'clock',
    };
  }

  if (unreadCount >= 5) {
    return {
      text: `لديك ${arCount(unreadCount, { one: 'إشعار جديد', two: 'إشعاران جديدان', few: 'إشعارات جديدة', many: 'إشعارًا جديدًا' })}`,
      href: '/notifications',
      tone: 'accent',
      icon: 'bell',
    };
  }

  if (streak > 0) {
    return {
      text: `سلسلتك ${arCount(streak, { one: 'يوم', two: 'يومان', few: 'أيام', many: 'يومًا' })} 🔥 — راجع درسًا اليوم للحفاظ عليها`,
      href: '/lectures/pdf',
      tone: 'warning',
      icon: 'flame',
    };
  }

  return {
    text: 'يوم هادئ — وقت ممتاز لمراجعة مسبقة أو حلّ واجب قادم',
    href: '/study/planner',
    tone: 'success',
    icon: 'sparkles',
  };
}
