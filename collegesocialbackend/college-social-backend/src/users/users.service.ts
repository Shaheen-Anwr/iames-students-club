import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import { User, UserDocument } from './schemas/user.schema';
import { RegisterDto } from '../auth/dto/register.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Role } from '../common/enums/role.enum';
import { getAcademicYearsForDepartment } from '../common/enums/academic-year.enum';
import { SPECIALIZATIONS_BY_DEPARTMENT } from '../common/enums/specialization.enum';
import { EmailService } from '../email/email.service';
import { DailyCount, daysAgoStart, fillDailyCounts } from '../common/utils/daily-counts.util';
import { RealtimeEmitterService } from '../realtime/realtime-emitter.service';

const VERIFICATION_CODE_TTL_MS = 15 * 60 * 1000; // 15min -- a typed OTP is meant to be used immediately
const PASSWORD_RESET_TTL_MS = 10 * 60 * 1000; // Shorter than email verification -- more sensitive

export interface PaginatedUsers {
  data: UserDocument[];
  total: number;
  page: number;
  limit: number;
}

export interface UserStats {
  total: number;
  students: number;
  professors: number;
  admins: number;
  active: number;
  verified: number;
  online: number;
  dailySignups: DailyCount[];
  byDepartment: Record<string, number>;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly emailService: EmailService,
    private readonly realtimeEmitter: RealtimeEmitterService,
  ) {}

  async findByCollegeId(collegeId: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ collegeId }).exec();
  }

  async findById(id: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id).select('-passwordHash').exec();
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    return user;
  }

  // Only for password verification (see AuthService.changePassword) -- findById() above
  // deliberately strips passwordHash for every other caller.
  async findByIdWithPassword(id: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id).exec();
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    return user;
  }

  async blockUser(userId: string, targetId: string): Promise<UserDocument> {
    if (userId === targetId) throw new BadRequestException('لا يمكنك حظر نفسك');
    const user = await this.userModel
      .findByIdAndUpdate(userId, { $addToSet: { blockedUsers: new Types.ObjectId(targetId) } }, { new: true })
      .select('-passwordHash')
      .exec();
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    return user;
  }

  async unblockUser(userId: string, targetId: string): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(userId, { $pull: { blockedUsers: new Types.ObjectId(targetId) } }, { new: true })
      .select('-passwordHash')
      .exec();
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    return user;
  }

  // Bidirectional: true if either side has blocked the other.
  async areBlocked(userId: string, otherId: string): Promise<boolean> {
    const count = await this.userModel
      .countDocuments({
        $or: [
          { _id: new Types.ObjectId(userId), blockedUsers: new Types.ObjectId(otherId) },
          { _id: new Types.ObjectId(otherId), blockedUsers: new Types.ObjectId(userId) },
        ],
      })
      .exec();
    return count > 0;
  }

  // The college email's local part must exactly equal the student's college ID, e.g.
  // "2430525@iames.mans.edu.eg" for collegeId "2430525". COLLEGE_EMAIL_DOMAIN includes the "@"
  // prefix; leave it blank in .env to disable this check entirely.
  private assertValidCollegeEmail(collegeId: string, collegeEmail: string): void {
    const domain = process.env.COLLEGE_EMAIL_DOMAIN;
    if (!domain) return;
    const expected = `${collegeId}${domain}`.toLowerCase();
    if (collegeEmail.toLowerCase() !== expected) {
      throw new BadRequestException(`البريد الجامعي يجب أن يكون ${expected} بالضبط`);
    }
  }

  async create(data: RegisterDto & { passwordHash: string }): Promise<UserDocument> {
    this.assertValidCollegeEmail(data.collegeId, data.collegeEmail);

    const existing = await this.userModel
      .findOne({ $or: [{ collegeId: data.collegeId }, { collegeEmail: data.collegeEmail }] })
      .exec();
    if (existing) {
      throw new ConflictException('الرقم الجامعي أو البريد الجامعي مسجّل مسبقًا');
    }

    // The very first account ever created on this deployment becomes the admin,
    // regardless of which role they picked on the registration form.
    const isFirstUser = (await this.userModel.estimatedDocumentCount().exec()) === 0;

    const user = new this.userModel({
      collegeId: data.collegeId,
      passwordHash: data.passwordHash,
      name: data.name,
      collegeEmail: data.collegeEmail,
      role: isFirstUser ? Role.ADMIN : data.role,
      department: data.department ?? null,
    });
    try {
      await user.save();
    } catch (err) {
      // Two requests can both pass the findOne check above before either saves (e.g. a flaky
      // mobile connection retrying the same submit, or a genuine ID collision under concurrent
      // signups) -- the unique index catches it here, so surface the same friendly message
      // instead of letting a raw E11000 bubble up as a 500.
      if ((err as { code?: number }).code === 11000) {
        throw new ConflictException('الرقم الجامعي أو البريد الجامعي مسجّل مسبقًا');
      }
      throw err;
    }

    this.realtimeEmitter.emitToAdmins('admin:activity', {
      type: 'signup',
      summary: `${user.name} انضم كـ ${user.role === Role.PROFESSOR ? 'أستاذ' : 'طالب'}`,
      at: new Date(),
    });
    return user;
  }

  async findByCollegeEmail(collegeEmail: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ collegeEmail }).exec();
  }

  async setEmailVerified(id: string): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(
        id,
        { collegeEmailVerifiedAt: new Date(), emailVerificationTokenHash: null, emailVerificationExpiresAt: null },
        { new: true },
      )
      .select('-passwordHash')
      .exec();
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    return user;
  }

  async setVerificationToken(id: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.userModel
      .findByIdAndUpdate(id, { emailVerificationTokenHash: tokenHash, emailVerificationExpiresAt: expiresAt })
      .exec();
  }

  // Generates a fresh 6-digit verification code, stores its hash, and emails the raw code.
  // Used on registration, on resend, and whenever a user changes their collegeEmail via update().
  async issueVerificationEmail(user: UserDocument): Promise<void> {
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);
    await this.setVerificationToken(user.id, codeHash, expiresAt);
    await this.emailService.sendVerificationEmail(user.collegeEmail, user.name, code);
  }

  // Blocks a student from registering their college email as their own recovery address --
  // defeats the point of having a separate, independently-reachable personal email (see
  // AuthService.setPersonalEmail). COLLEGE_EMAIL_DOMAIN includes the "@" prefix, same as
  // assertValidCollegeEmail; left blank in .env, this check is skipped entirely.
  private assertPersonalEmailNotCollege(personalEmail: string): void {
    const domain = process.env.COLLEGE_EMAIL_DOMAIN;
    if (!domain) return;
    if (personalEmail.toLowerCase().endsWith(domain.toLowerCase())) {
      throw new BadRequestException('يجب استخدام بريد شخصي مختلف عن بريدك الجامعي');
    }
  }

  async findByPersonalEmail(personalEmail: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ personalEmail: personalEmail.toLowerCase() }).exec();
  }

  // Overwrites any previously-set personal email -- see AuthController#setPersonalEmail, which
  // requires the caller's current password before calling this.
  async updatePersonalEmail(id: string, personalEmail: string): Promise<UserDocument> {
    this.assertPersonalEmailNotCollege(personalEmail);
    try {
      const user = await this.userModel
        .findByIdAndUpdate(id, { personalEmail }, { new: true })
        .select('-passwordHash')
        .exec();
      if (!user) throw new NotFoundException('المستخدم غير موجود');
      return user;
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw new ConflictException('هذا البريد الشخصي مستخدم من قبل حساب آخر');
      }
      throw err;
    }
  }

  async setPasswordResetToken(id: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.userModel.findByIdAndUpdate(id, { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: expiresAt }).exec();
  }

  async clearPasswordResetToken(id: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(id, { passwordResetTokenHash: null, passwordResetExpiresAt: null }).exec();
  }

  // Generates a fresh 6-digit reset code, stores its hash, and emails the raw code to the
  // student's personal (not college) email -- see AuthService.forgotPassword.
  async issuePasswordResetEmail(user: UserDocument): Promise<void> {
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
    await this.setPasswordResetToken(user.id, codeHash, expiresAt);
    await this.emailService.sendPasswordResetEmail(user.personalEmail!, user.name, code);
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserDocument> {
    const existing = await this.userModel.findById(id).exec();
    if (!existing) throw new NotFoundException('المستخدم غير موجود');

    const emailChanged = dto.collegeEmail !== undefined && dto.collegeEmail !== existing.collegeEmail;
    if (emailChanged) this.assertValidCollegeEmail(existing.collegeId, dto.collegeEmail!);

    // Cross-validate against whichever department will be in effect after this update (the
    // incoming one if changed, otherwise the existing one) -- same check PostsService.create()
    // does for a lecture upload's department/academicYear combo.
    const effectiveDepartment = dto.department !== undefined ? dto.department : existing.department;
    if (dto.academicYear && effectiveDepartment && !getAcademicYearsForDepartment(effectiveDepartment).includes(dto.academicYear)) {
      throw new BadRequestException('السنة الدراسية المختارة غير متاحة لهذه الشعبة.');
    }
    if (dto.specialization && effectiveDepartment && !SPECIALIZATIONS_BY_DEPARTMENT[effectiveDepartment].includes(dto.specialization)) {
      throw new BadRequestException('التخصص المختار غير متاح لهذه الشعبة.');
    }

    // A changed collegeEmail drops back to unverified -- same as a fresh signup, it now waits
    // for an admin to verify it from the dashboard rather than emailing a self-serve code.
    const user = await this.userModel
      .findByIdAndUpdate(id, emailChanged ? { ...dto, collegeEmailVerifiedAt: null } : dto, { new: true })
      .select('-passwordHash')
      .exec();
    if (!user) throw new NotFoundException('المستخدم غير موجود');

    return user;
  }

  async updatePhoto(id: string, photoUrl: string): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(id, { photoUrl }, { new: true })
      .select('-passwordHash')
      .exec();
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    return user;
  }

  async updateCoverPhoto(id: string, coverPhotoUrl: string): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(id, { coverPhotoUrl }, { new: true })
      .select('-passwordHash')
      .exec();
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    return user;
  }

  async removePhoto(id: string): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(id, { photoUrl: null }, { new: true })
      .select('-passwordHash')
      .exec();
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    return user;
  }

  async removeCoverPhoto(id: string): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(id, { coverPhotoUrl: null }, { new: true })
      .select('-passwordHash')
      .exec();
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    return user;
  }

  async search(query: string): Promise<UserDocument[]> {
    return this.userModel
      .find({
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { collegeId: { $regex: query, $options: 'i' } },
        ],
      })
      .select('-passwordHash')
      .limit(20)
      .exec();
  }

  // Used to validate @mention tokens parsed out of a post/comment/message: which of these
  // candidate ids actually belong to a real user. Silently drops malformed ids rather than
  // throwing, since a stale/tampered mention token should just be dropped, not fail the whole post.
  async findExistingIds(ids: string[]): Promise<string[]> {
    if (!ids.length) return [];
    const users = await this.userModel.find({ _id: { $in: ids } }).select('_id').exec();
    return users.map((u) => u._id.toString());
  }

  // --- Admin-only operations (guarded at the controller level) ---

  async findAllPaginated(page = 1, limit = 20, search?: string, verified?: boolean): Promise<PaginatedUsers> {
    const filter: Record<string, unknown> = search
      ? {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { collegeId: { $regex: search, $options: 'i' } },
            { collegeEmail: { $regex: search, $options: 'i' } },
          ],
        }
      : {};
    if (verified !== undefined) {
      filter.collegeEmailVerifiedAt = verified ? { $ne: null } : null;
    }

    const [data, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select('-passwordHash')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.userModel.countDocuments(filter).exec(),
    ]);

    return { data, total, page, limit };
  }

  async updateRole(id: string, role: Role): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(id, { role }, { new: true })
      .select('-passwordHash')
      .exec();
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    return user;
  }

  async updateActive(id: string, isActive: boolean): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(id, { isActive }, { new: true })
      .select('-passwordHash')
      .exec();
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    return user;
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<UserDocument> {
    const user = await this.userModel.findByIdAndUpdate(id, { passwordHash }, { new: true }).exec();
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    return user;
  }

  async remove(id: string): Promise<void> {
    const user = await this.userModel.findByIdAndDelete(id).exec();
    if (!user) throw new NotFoundException('المستخدم غير موجود');
  }

  async setOnline(id: string, isOnline: boolean, lastSeenAt?: Date): Promise<void> {
    await this.userModel
      .findByIdAndUpdate(id, { isOnline, ...(lastSeenAt ? { lastSeenAt } : {}) })
      .exec();
  }

  async countAdmins(): Promise<number> {
    return this.userModel.countDocuments({ role: Role.ADMIN }).exec();
  }

  async getStats(): Promise<UserStats> {
    const [total, students, professors, admins, active, verified, online, dailySignups, byDepartmentRows] = await Promise.all([
      this.userModel.countDocuments().exec(),
      this.userModel.countDocuments({ role: Role.STUDENT }).exec(),
      this.userModel.countDocuments({ role: Role.PROFESSOR }).exec(),
      this.userModel.countDocuments({ role: Role.ADMIN }).exec(),
      this.userModel.countDocuments({ isActive: { $ne: false } }).exec(),
      this.userModel.countDocuments({ collegeEmailVerifiedAt: { $ne: null } }).exec(),
      this.userModel.countDocuments({ isOnline: true }).exec(),
      this.dailySignups(14),
      this.userModel
        .aggregate<{ _id: string; count: number }>([
          { $match: { department: { $ne: null } } },
          { $group: { _id: '$department', count: { $sum: 1 } } },
        ])
        .exec(),
    ]);
    const byDepartment = Object.fromEntries(byDepartmentRows.map((r) => [r._id, r.count]));
    return { total, students, professors, admins, active, verified, online, dailySignups, byDepartment };
  }

  async countOnline(): Promise<number> {
    return this.userModel.countDocuments({ isOnline: true }).exec();
  }

  private async dailySignups(days: number): Promise<DailyCount[]> {
    const rows = await this.userModel
      .aggregate<{ _id: string; count: number }>([
        { $match: { createdAt: { $gte: daysAgoStart(days) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      ])
      .exec();
    return fillDailyCounts(rows, days);
  }
}
