export type Department = 'business_administration' | 'media_science' | 'engineering';

export const DEPARTMENT_LABELS: Record<Department, string> = {
  business_administration: 'شعبة إدارة الأعمال',
  media_science: 'شعبة علوم الإعلام',
  engineering: 'شعبة هندسة',
};

export const DEPARTMENTS = Object.keys(DEPARTMENT_LABELS) as Department[];

// Length of the program in years, per department -- e.g. engineering runs a 5th year, the others don't.
export const DEPARTMENT_DURATIONS: Record<Department, number> = {
  business_administration: 4,
  media_science: 4,
  engineering: 5,
};
