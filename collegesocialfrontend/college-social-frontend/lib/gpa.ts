// Mirror of the backend's src/gpa/grade-points.ts -- keep both in sync (same convention as
// lib/specializations.ts <-> common/enums/specialization.enum.ts). The backend is the source of
// truth for stored GPA figures; this copy powers instant, optimistic UI updates.

export const GRADE_POINTS = {
  A: 4.0,
  'A-': 3.7,
  'B+': 3.3,
  B: 3.0,
  'B-': 2.7,
  'C+': 2.3,
  C: 2.0,
  'C-': 1.7,
  'D+': 1.3,
  D: 1.0,
  F: 0.0,
} as const;

export type GradeLetter = keyof typeof GRADE_POINTS;

export const GRADE_LETTERS = Object.keys(GRADE_POINTS) as GradeLetter[];

// Short qualitative label per grade, for the UI.
export const GRADE_LABELS: Record<GradeLetter, string> = {
  A: 'ممتاز',
  'A-': 'ممتاز',
  'B+': 'جيد جدًا',
  B: 'جيد جدًا',
  'B-': 'جيد جدًا',
  'C+': 'جيد',
  C: 'جيد',
  'C-': 'مقبول',
  'D+': 'مقبول',
  D: 'مقبول',
  F: 'راسب',
};

// Credit-hours bounds -- must stay in sync with the backend DTO (@Min/@Max in
// src/gpa/dto/create-gpa-course.dto.ts) so client-side edits never round-trip to a 400.
export const MIN_CREDIT_HOURS = 0.5;
export const MAX_CREDIT_HOURS = 12;

// Clamp a user-entered credit-hours value into the accepted range, snapped to the nearest 0.5.
// Returns null when the input isn't a usable positive number (empty field, letters, <= 0).
export function clampCreditHours(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const snapped = Math.round(value * 2) / 2;
  return Math.min(MAX_CREDIT_HOURS, Math.max(MIN_CREDIT_HOURS, snapped));
}

interface GpaInput {
  creditHours: number;
  grade: GradeLetter | null;
  countsTowardGpa: boolean;
}

// GPA = sum(points * credits) / sum(credits) over graded courses that count toward the GPA.
// `countsTowardGpa` is opt-out (default true), so only an explicit `false` drops a course.
export function computeGpa(courses: GpaInput[]): { gpa: number; credits: number } {
  let credits = 0;
  let points = 0;
  for (const c of courses) {
    if (!c.grade || c.countsTowardGpa === false) continue;
    credits += c.creditHours;
    points += GRADE_POINTS[c.grade] * c.creditHours;
  }
  return { gpa: credits ? Math.round((points / credits) * 100) / 100 : 0, credits: Math.round(credits * 100) / 100 };
}

// GPA figures are on a 4.0 scale; anything >= 3.0 is "very good" territory here.
export function gpaTone(gpa: number): 'good' | 'ok' | 'low' {
  if (gpa >= 3.0) return 'good';
  if (gpa >= 2.0) return 'ok';
  return 'low';
}
