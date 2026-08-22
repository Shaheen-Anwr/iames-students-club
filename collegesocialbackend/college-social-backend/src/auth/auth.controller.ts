import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService, RequestMeta } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from './types/authenticated-user.type';

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/auth';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private requestMeta(req: Request): RequestMeta {
    return {
      userAgent: req.headers['user-agent'] ?? null,
      ip: req.ip ?? null,
    };
  }

  // Frontend and backend live on different domains in production (e.g. Vercel + Render), so the
  // cookie must be SameSite=None (requires Secure) to survive a cross-site fetch(credentials:
  // 'include'); SameSite=Lax silently drops it on cross-site XHR/fetch, only allowing top-level
  // navigations. Locally both run on http://localhost, where Secure cookies aren't sent at all,
  // so dev keeps Lax + non-secure.
  private refreshCookieOptions() {
    const isProd = process.env.NODE_ENV === 'production';
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
      path: REFRESH_COOKIE_PATH,
    };
  }

  private setRefreshCookie(res: Response, token: string) {
    res.cookie(REFRESH_COOKIE_NAME, token, {
      ...this.refreshCookieOptions(),
      maxAge: this.authService.refreshCookieMaxAgeMs(),
    });
  }

  // POST /api/auth/register  { collegeId, password, name, collegeEmail, role }
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { refreshToken, ...body } = await this.authService.register(dto, this.requestMeta(req));
    this.setRefreshCookie(res, refreshToken);
    return body;
  }

  // POST /api/auth/login  { collegeId, password }
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { refreshToken, ...body } = await this.authService.login(dto, this.requestMeta(req));
    this.setRefreshCookie(res, refreshToken);
    return body;
  }

  // POST /api/auth/refresh -- refresh token comes from the httpOnly cookie, not the body
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
    const { refreshToken, accessToken } = await this.authService.refresh(rawToken, this.requestMeta(req));
    this.setRefreshCookie(res, refreshToken);
    return { accessToken };
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(@CurrentUser() user: AuthenticatedUser, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(user.sessionId);
    res.clearCookie(REFRESH_COOKIE_NAME, this.refreshCookieOptions());
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('logout-all')
  async logoutAll(@CurrentUser() user: AuthenticatedUser) {
    await this.authService.logoutAll(user.userId, user.sessionId);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  async sessions(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.listSessions(user.userId, user.sessionId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('sessions/:id')
  async revokeSession(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const revoked = await this.authService.revokeSession(id, user.userId);
    return { success: revoked };
  }

  // POST /api/auth/verify-email  { code } -- code was emailed to the caller's own collegeEmail
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  async verifyEmail(@CurrentUser() user: AuthenticatedUser, @Body() dto: VerifyEmailDto) {
    await this.authService.verifyEmail(user.userId, dto.code);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @Post('resend-verification')
  async resendVerification(@CurrentUser() user: AuthenticatedUser) {
    await this.authService.resendVerification(user.userId);
    return { success: true };
  }
}
