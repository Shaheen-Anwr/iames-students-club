// The 4.0 letter-grade scale used by the GPA calculator. Single source of truth -- mirrored on
// the frontend at lib/gpa.ts (same "keep both in sync" pattern as the specialization enum).
// Retune here if the institution's official scale differs.
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
