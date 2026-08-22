import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum';

export const ROLES_KEY = 'roles';

/**
 * Usage: @Roles(Role.PROFESSOR)
 * Restricts an endpoint to the given role(s). Must be combined with RolesGuard.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
