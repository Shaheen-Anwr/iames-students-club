import { Role } from '../../common/enums/role.enum';
import { Department } from '../../common/enums/department.enum';

// Shape of the payload attached to req.user after JwtStrategy.validate() runs.
export interface AuthenticatedUser {
  userId: string;
  collegeId: string;
  role: Role;
  department: Department | null;
  sessionId: string;
}
