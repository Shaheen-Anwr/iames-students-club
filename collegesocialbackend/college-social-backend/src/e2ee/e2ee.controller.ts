import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { E2eeService } from './e2ee.service';
import { AddPreKeysDto, RegisterKeysDto } from './dto/register-keys.dto';

// Public-key registry for chat E2EE (docs/e2ee-design.md). Every route is 403 until E2EE_ENABLED.
@UseGuards(JwtAuthGuard)
@Controller('e2ee')
export class E2eeController {
  constructor(private readonly e2eeService: E2eeService) {}

  @Get('status')
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.e2eeService.status(user.userId);
  }

  // POST /api/e2ee/keys -- register/replace the caller's bundle (+ reset one-time prekeys).
  @Post('keys')
  register(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterKeysDto) {
    return this.e2eeService.registerKeys(user.userId, dto);
  }

  // POST /api/e2ee/keys/prekeys -- top up the one-time prekey pool.
  @Post('keys/prekeys')
  addPreKeys(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddPreKeysDto) {
    return this.e2eeService.addPreKeys(user.userId, dto);
  }

  // GET /api/e2ee/keys/:userId -- fetch a peer's bundle, popping one one-time prekey.
  @Get('keys/:userId')
  bundle(@Param('userId') userId: string) {
    return this.e2eeService.getBundle(userId);
  }

  // GET /api/e2ee/keys/:userId/identity -- just the identity key (verification + key-change checks).
  @Get('keys/:userId/identity')
  identity(@Param('userId') userId: string) {
    return this.e2eeService.getIdentity(userId);
  }
}
