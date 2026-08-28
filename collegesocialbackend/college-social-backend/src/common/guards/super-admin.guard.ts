import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { UsersService } from '../../users/users.service';

// Restricts a route to super admins only -- a strict subset of `role: 'admin'`. Used by
// AdminController (user-account management). Combine with JwtAuthGuard, which populates req.user.
//
// Deliberately re-reads the user document instead of trusting a claim baked into the JWT: the
// access token has no isSuperAdmin claim, and a fresh lookup means granting/revoking the flag takes
// effect on the target's very next request rather than after they re-login.
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest();
    if (!user?.userId) {
      throw new ForbiddenException('غير مصرّح');
    }

    const fresh = await this.usersService.findById(user.userId);
    if (!fresh.isSuperAdmin) {
      throw new ForbiddenException('هذا الإجراء مقتصر على المدير العام');
    }
    return true;
  }
}
