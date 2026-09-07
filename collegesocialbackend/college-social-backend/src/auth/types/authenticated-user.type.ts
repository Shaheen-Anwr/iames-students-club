import { Role } from '../../common/enums/role.enum';
import { Department } from '../../common/enums/department.enum';

// Shape of the payload attached to req.user after JwtStrategy.validate() runs.
export interface AuthenticatedUser {
  userId: string;
  collegeId: string;
  role: Role;
  department: Department | null;
  // A strict subset of `role: 'admin'`. Rides in the access token so read-scoping (feed/search/
  // lecture library/QA/announcements/calendar/AI context) can treat a super admin as deptless --
  // i.e. unrestricted across every شعبة -- without a DB lookup on the hot path. Refreshed on the
  // next token rotation (~15min) after the flag is granted/revoked; security-sensitive routes
  // still re-read the user doc (see SuperAdminGuard). See viewerScopeDepartment().
  isSuperAdmin: boolean;
  sessionId: string;
}
