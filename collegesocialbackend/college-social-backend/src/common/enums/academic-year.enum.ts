import { Department, DEPARTMENT_DURATIONS } from './department.enum';

export enum AcademicYear {
  YEAR_1 = 'year1',
  YEAR_2 = 'year2',
  YEAR_3 = 'year3',
  YEAR_4 = 'year4',
  YEAR_5 = 'year5',
}

export const ACADEMIC_YEARS = Object.values(AcademicYear);

// The AcademicYear values valid for a department, based on how many years its program runs
// (see DEPARTMENT_DURATIONS) -- e.g. a 4-year department only offers year1..year4.
export function getAcademicYearsForDepartment(department: Department): AcademicYear[] {
  return ACADEMIC_YEARS.slice(0, DEPARTMENT_DURATIONS[department]);
}
