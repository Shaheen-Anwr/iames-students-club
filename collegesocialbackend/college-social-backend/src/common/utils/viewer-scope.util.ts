import { Department } from '../enums/department.enum';

// The شعبة (department) a viewer's *read* results are scoped to across every surface that walls
// content by department: the feed, search, the lecture library, QA, announcements, the calendar
// and the AI assistant's context.
//
// A super admin is deliberately treated as deptless (null) here, so they see every شعبة's
// content regardless of the department set on their own profile -- exactly the unrestricted view
// a staff/admin account with no department already gets. Everyone else stays scoped to their own
// شعبة, unchanged.
//
// This only affects what a super admin can *see*. Posts / questions / announcements they create
// are still filed under their own profile department as before -- those call sites read
// `user.department` directly and are intentionally left alone.
export function viewerScopeDepartment(user: {
  department: Department | null;
  isSuperAdmin?: boolean;
}): Department | null {
  return user.isSuperAdmin ? null : user.department;
}
