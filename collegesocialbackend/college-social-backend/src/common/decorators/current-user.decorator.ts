import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Usage: findMe(@CurrentUser() user: AuthenticatedUser)
 * Pulls the JWT-decoded user payload that JwtStrategy.validate() attached to the request.
 */
export const CurrentUser = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
