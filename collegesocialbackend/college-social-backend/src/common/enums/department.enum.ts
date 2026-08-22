export enum Department {
  BUSINESS_ADMINISTRATION = 'business_administration',
  MEDIA_SCIENCE = 'media_science',
  ENGINEERING = 'engineering',
}

// Departments a user can pick for themselves -- every value right now, but kept as its own
// export (mirrors REGISTERABLE_ROLES) in case a department is ever retired without breaking
// existing users still assigned to it.
export const SELECTABLE_DEPARTMENTS = Object.values(Department);

// Length of the program in years, per department -- used to limit which AcademicYear values
// are valid for a given department (e.g. engineering runs a 5th year, the others don't).
export const DEPARTMENT_DURATIONS: Record<Department, number> = {
  [Department.BUSINESS_ADMINISTRATION]: 4,
  [Department.MEDIA_SCIENCE]: 4,
  [Department.ENGINEERING]: 5,
};
