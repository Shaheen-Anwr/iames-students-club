// Shared weekly-timetable primitives, used by both the schedule grid and the attendance tracker.

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// College week runs Saturday -> Friday. `value` matches JS Date#getDay() / getUTCDay().
export const WEEK_DAYS: { value: DayOfWeek; label: string; short: string }[] = [
  { value: 6, label: 'السبت', short: 'سبت' },
  { value: 0, label: 'الأحد', short: 'أحد' },
  { value: 1, label: 'الاثنين', short: 'اثنين' },
  { value: 2, label: 'الثلاثاء', short: 'ثلاثاء' },
  { value: 3, label: 'الأربعاء', short: 'أربعاء' },
  { value: 4, label: 'الخميس', short: 'خميس' },
  { value: 5, label: 'الجمعة', short: 'جمعة' },
];

const PALETTE = [
  'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30',
  'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30',
  'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/30',
  'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30',
  'bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-500/20 dark:text-pink-300 dark:border-pink-500/30',
  'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-500/20 dark:text-teal-300 dark:border-teal-500/30',
];

// Stable per-course-name colour class set, so a course looks the same everywhere it appears.
export function courseColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
