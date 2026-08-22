import { DEPARTMENT_DURATIONS, type Department } from './departments';

export type AcademicYear = 'year1' | 'year2' | 'year3' | 'year4' | 'year5';

export const ACADEMIC_YEAR_LABELS: Record<AcademicYear, string> = {
  year1: 'السنة الأولى',
  year2: 'السنة الثانية',
  year3: 'السنة الثالثة',
  year4: 'السنة الرابعة',
  year5: 'السنة الخامسة',
};

export const ACADEMIC_YEARS = Object.keys(ACADEMIC_YEAR_LABELS) as AcademicYear[];

// The AcademicYear values valid for a department, based on how many years its program runs
// (see DEPARTMENT_DURATIONS) -- e.g. a 4-year department only offers year1..year4.
export function getAcademicYearsForDepartment(department: Department): AcademicYear[] {
  return ACADEMIC_YEARS.slice(0, DEPARTMENT_DURATIONS[department]);
}
