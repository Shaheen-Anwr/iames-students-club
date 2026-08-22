export enum Role {
  STUDENT = 'student',
  PROFESSOR = 'professor',
  ADMIN = 'admin',
}

// Roles a user is allowed to pick for themselves at registration time.
// ADMIN is never self-assigned — it's granted automatically to the very first
// registered user (see UsersService.create) or promoted later by an existing admin.
export const REGISTERABLE_ROLES = [Role.STUDENT, Role.PROFESSOR] as const;
