import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { UserDocument } from '../users/schemas/user.schema';
import { GamificationService } from '../gamification/gamification.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SetPersonalEmailDto } from './dto/set-personal-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Session, SessionDocument } from './schemas/session.schema';

const SALT_ROUNDS = 10;

export interface RequestMeta {
  userAgent: string | null;
  ip: string | null;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string; // raw opaque "sessionId.secret" -- controller sets this as an httpOnly cookie
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly gamificationService: GamificationService,
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
  ) {}

  async register(dto: RegisterDto, meta: RequestMeta) {
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    // Email verification is admin-driven (see AdminController#verifyEmail), not a self-serve
    // code -- new accounts just sit unverified until an admin reviews them from the dashboard.
    const user = await this.usersService.create({ ...dto, passwordHash });
    await this.gamificationService.recordActivity(user.id);
    if (dto.referralCode) await this.applyReferral(user, dto.referralCode);
    const tokens = await this.issueTokens(user.id, user.collegeId, user.role, user.department, meta);
    return { ...tokens, user: this.publicUser(user) };
  }

  // Best-effort: links the new account to the inviter (by collegeId) and credits the referral.
  // Any failure here -- unknown code, self-referral, DB hiccup -- is swallowed so it can never
  // strand a student mid-signup with an account that already exists.
  private async applyReferral(newUser: UserDocument, code: string): Promise<void> {
    try {
      const referrer = await this.usersService.findByCollegeId(code.trim());
      if (!referrer || referrer.id === newUser.id) return;
      newUser.referredBy = new Types.ObjectId(referrer.id);
      await newUser.save();
      await this.gamificationService.recordReferral(referrer.id);
    } catch {
      // ignore -- a bad referral code must not break registration
    }
  }

  async login(dto: LoginDto, meta: RequestMeta) {
    const user = await this.usersService.findByCollegeId(dto.collegeId);
    if (!user) {
      throw new UnauthorizedException('الرقم الجامعي أو كلمة المرور غير صحيحة');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('الرقم الجامعي أو كلمة المرور غير صحيحة');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('تم إيقاف هذا الحساب. يرجى التواصل مع الإدارة.');
    }

    await this.gamificationService.recordActivity(user.id);
    const tokens = await this.issueTokens(user.id, user.collegeId, user.role, user.department, meta);
    return { ...tokens, user: this.publicUser(user) };
  }

  async refresh(rawToken: string, meta: RequestMeta): Promise<AuthTokens> {
    const [sessionId, secret] = (rawToken ?? '').split('.');
    if (!sessionId || !secret || !Types.ObjectId.isValid(sessionId)) {
      throw new UnauthorizedException('جلسة غير صالحة');
    }

    const session = await this.sessionModel.findById(sessionId).exec();
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('جلسة غير صالحة أو منتهية');
    }

    if (this.hashSecret(secret) !== session.refreshTokenHash) {
      // The presented secret doesn't match what we last issued for this session -- it's an
      // already-rotated-out (or forged) token being replayed. Treat as compromise.
      session.revokedAt = new Date();
      await session.save();
      throw new UnauthorizedException('تم اكتشاف استخدام غير معتاد لهذه الجلسة، تم إنهاؤها');
    }

    const user = await this.usersService.findById(session.user.toString());

    const newSecret = crypto.randomBytes(32).toString('hex');
    session.refreshTokenHash = this.hashSecret(newSecret);
    session.lastUsedAt = new Date();
    session.expiresAt = this.refreshExpiry();
    session.userAgent = meta.userAgent;
    session.ip = meta.ip;
    await session.save();

    return {
      accessToken: this.signAccessToken(user.id, user.collegeId, user.role, user.department, sessionId),
      refreshToken: `${sessionId}.${newSecret}`,
    };
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessionModel.findByIdAndUpdate(sessionId, { revokedAt: new Date() }).exec();
  }

  async logoutAll(userId: string, exceptSessionId?: string): Promise<void> {
    const filter: Record<string, unknown> = { user: new Types.ObjectId(userId), revokedAt: null };
    if (exceptSessionId) filter._id = { $ne: new Types.ObjectId(exceptSessionId) };
    await this.sessionModel.updateMany(filter, { revokedAt: new Date() }).exec();
  }

  async changePassword(userId: string, sessionId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.usersService.findByIdWithPassword(userId);
    const matches = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!matches) throw new UnauthorizedException('كلمة المرور الحالية غير صحيحة');

    const passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    await this.usersService.updatePasswordHash(userId, passwordHash);
    // Revoke every other session as a security measure, matching the change-password UX of most
    // apps -- the caller's own session (already re-authenticated by supplying the current
    // password) stays logged in.
    await this.logoutAll(userId, sessionId);
  }

  async setPersonalEmail(userId: string, dto: SetPersonalEmailDto): Promise<void> {
    const user = await this.usersService.findByIdWithPassword(userId);
    const matches = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!matches) throw new UnauthorizedException('كلمة المرور الحالية غير صحيحة');
    await this.usersService.updatePersonalEmail(userId, dto.personalEmail);
  }

  // Always resolves the same way regardless of whether personalEmail matches an account --
  // callers must not be able to tell which emails are registered (standard reset-flow
  // enumeration guard). The controller returns one generic message unconditionally.
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.usersService.findByPersonalEmail(dto.personalEmail);
    if (user) await this.usersService.issuePasswordResetEmail(user);
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const user = await this.usersService.findByPersonalEmail(dto.personalEmail);
    const codeHash = crypto.createHash('sha256').update(dto.code).digest('hex');
    const valid =
      !!user &&
      user.passwordResetTokenHash === codeHash &&
      !!user.passwordResetExpiresAt &&
      user.passwordResetExpiresAt > new Date();
    if (!valid) {
      // Same message whether the email doesn't exist or the code is wrong/expired -- don't leak
      // which case it was.
      throw new UnauthorizedException('رمز التحقق غير صالح أو منتهي الصلاحية');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    await this.usersService.updatePasswordHash(user.id, passwordHash);
    await this.usersService.clearPasswordResetToken(user.id);
    // No session to exempt here (unlike changePassword) -- the whole point is the student is
    // locked out, so every existing session dies and they must log in fresh with the new password.
    await this.logoutAll(user.id);
  }

  async listSessions(userId: string, currentSessionId: string) {
    const sessions = await this.sessionModel
      .find({ user: new Types.ObjectId(userId), revokedAt: null })
      .sort({ lastUsedAt: -1 })
      .exec();

    return sessions.map((session) => ({
      id: session.id,
      userAgent: session.userAgent,
      ip: session.ip,
      createdAt: (session as unknown as { createdAt: Date }).createdAt,
      lastUsedAt: session.lastUsedAt,
      current: session.id === currentSessionId,
    }));
  }

  async revokeSession(sessionId: string, userId: string): Promise<boolean> {
    const result = await this.sessionModel
      .findOneAndUpdate({ _id: sessionId, user: new Types.ObjectId(userId), revokedAt: null }, { revokedAt: new Date() })
      .exec();
    return !!result;
  }

  async verifyEmail(userId: string, code: string): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (user.collegeEmailVerifiedAt) return; // already verified, nothing to do

    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const valid =
      user.emailVerificationTokenHash === codeHash &&
      !!user.emailVerificationExpiresAt &&
      user.emailVerificationExpiresAt > new Date();
    if (!valid) {
      throw new UnauthorizedException('رمز التحقق غير صالح أو منتهي الصلاحية');
    }
    await this.usersService.setEmailVerified(userId);
  }

  async resendVerification(userId: string): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (user.collegeEmailVerifiedAt) return; // already verified, no-op
    await this.usersService.issueVerificationEmail(user);
  }

  private async issueTokens(
    userId: string,
    collegeId: string,
    role: string,
    department: string | null,
    meta: RequestMeta,
  ): Promise<AuthTokens> {
    const secret = crypto.randomBytes(32).toString('hex');
    const session = new this.sessionModel({
      user: new Types.ObjectId(userId),
      refreshTokenHash: this.hashSecret(secret),
      userAgent: meta.userAgent,
      ip: meta.ip,
      lastUsedAt: new Date(),
      expiresAt: this.refreshExpiry(),
    });
    await session.save();

    return {
      accessToken: this.signAccessToken(userId, collegeId, role, department, session.id),
      refreshToken: `${session.id}.${secret}`,
    };
  }

  private signAccessToken(userId: string, collegeId: string, role: string, department: string | null, sessionId: string): string {
    return this.jwtService.sign({ sub: userId, collegeId, role, department, sid: sessionId });
  }

  private hashSecret(secret: string): string {
    return crypto.createHash('sha256').update(secret).digest('hex');
  }

  private refreshExpiry(): Date {
    const days = this.config.get<number>('refreshTokenExpiresInDays') ?? 30;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  refreshCookieMaxAgeMs(): number {
    const days = this.config.get<number>('refreshTokenExpiresInDays') ?? 30;
    return days * 24 * 60 * 60 * 1000;
  }

  private publicUser(user: UserDocument) {
    return {
      id: user.id,
      collegeId: user.collegeId,
      name: user.name,
      collegeEmail: user.collegeEmail,
      role: user.role,
      isSuperAdmin: user.isSuperAdmin,
      department: user.department,
      collegeEmailVerifiedAt: user.collegeEmailVerifiedAt,
      personalEmail: user.personalEmail,
    };
  }
}
