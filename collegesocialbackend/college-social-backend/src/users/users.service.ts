import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
import {
  DailyCount,
  daysAgoStart,
  fillDailyCounts,
  previousWindowMatch,
  TrendSeries,
} from '../common/utils/daily-counts.util';
import { RealtimeEmitterService } from '../realtime/realtime-emitter.service';
import { NotificationsService } from '../notifications/notifications.service';

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
    private readonly notificationsService: NotificationsService,
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

  // --- Friendship: request/accept, mirrored across both users' documents (see user.schema.ts) ---

  async sendFriendRequest(userId: string, targetId: string): Promise<UserDocument> {
    if (userId === targetId) throw new BadRequestException('لا يمكنك إضافة نفسك كصديق');
    const [me, target] = await Promise.all([this.userModel.findById(userId).exec(), this.userModel.findById(targetId).exec()]);
    if (!me || !target) throw new NotFoundException('المستخدم غير موجود');
    if (me.friends.some((f) => f.toString() === targetId)) throw new BadRequestException('أنتما صديقان بالفعل');
    if (await this.areBlocked(userId, targetId)) throw new ForbiddenException('لا يمكنك إضافة هذا المستخدم');

    // They already asked us first -- accept theirs instead of crossing two pending requests.
    if (me.friendRequestsReceived.some((f) => f.toString() === targetId)) {
      return this.acceptFriendRequest(userId, targetId);
    }

    const uid = new Types.ObjectId(userId);
    const tid = new Types.ObjectId(targetId);
    if (!me.friendRequestsSent.some((f) => f.toString() === targetId)) me.friendRequestsSent.push(tid);
    if (!target.friendRequestsReceived.some((f) => f.toString() === userId)) target.friendRequestsReceived.push(uid);
    await Promise.all([me.save(), target.save()]);

    await this.notificationsService.create({ recipient: targetId, actor: userId, type: 'friend_request' });
    return this.findById(userId);
  }

  async acceptFriendRequest(userId: string, requesterId: string): Promise<UserDocument> {
    const [me, requester] = await Promise.all([
      this.userModel.findById(userId).exec(),
      this.userModel.findById(requesterId).exec(),
    ]);
    if (!me || !requester) throw new NotFoundException('المستخدم غير موجود');
    if (!me.friendRequestsReceived.some((f) => f.toString() === requesterId)) {
      throw new BadRequestException('لا يوجد طلب صداقة من هذا المستخدم');
    }

    const uid = new Types.ObjectId(userId);
    const rid = new Types.ObjectId(requesterId);
    me.friendRequestsReceived = me.friendRequestsReceived.filter((f) => f.toString() !== requesterId) as unknown as Types.ObjectId[];
    requester.friendRequestsSent = requester.friendRequestsSent.filter((f) => f.toString() !== userId) as unknown as Types.ObjectId[];
    if (!me.friends.some((f) => f.toString() === requesterId)) me.friends.push(rid);
    if (!requester.friends.some((f) => f.toString() === userId)) requester.friends.push(uid);
    await Promise.all([me.save(), requester.save()]);

    await this.notificationsService.create({ recipient: requesterId, actor: userId, type: 'friend_accept' });
    return this.findById(userId);
  }

  // Covers both "cancel a request I sent" and "decline a request I received" -- symmetric removal
  // regardless of which direction the pending request was in.
  async removeFriendRequest(userId: string, otherId: string): Promise<UserDocument> {
    const [me, other] = await Promise.all([this.userModel.findById(userId).exec(), this.userModel.findById(otherId).exec()]);
    if (!me || !other) throw new NotFoundException('المستخدم غير موجود');

    me.friendRequestsSent = me.friendRequestsSent.filter((f) => f.toString() !== otherId) as unknown as Types.ObjectId[];
    me.friendRequestsReceived = me.friendRequestsReceived.filter((f) => f.toString() !== otherId) as unknown as Types.ObjectId[];
    other.friendRequestsSent = other.friendRequestsSent.filter((f) => f.toString() !== userId) as unknown as Types.ObjectId[];
    other.friendRequestsReceived = other.friendRequestsReceived.filter((f) => f.toString() !== userId) as unknown as Types.ObjectId[];
    await Promise.all([me.save(), other.save()]);
    return this.findById(userId);
  }

  async unfriend(userId: string, otherId: string): Promise<UserDocument> {
    const [me, other] = await Promise.all([this.userModel.findById(userId).exec(), this.userModel.findById(otherId).exec()]);
    if (!me || !other) throw new NotFoundException('المستخدم غير موجود');

    me.friends = me.friends.filter((f) => f.toString() !== otherId) as unknown as Types.ObjectId[];
    other.friends = other.friends.filter((f) => f.toString() !== userId) as unknown as Types.ObjectId[];
    await Promise.all([me.save(), other.save()]);
    return this.findById(userId);
  }

  // Populated friends list for `id` -- works for any user, not just the caller (both the /friends
  // page, for the caller's own id, and a profile's "Friends" tab, for whichever profile is open,
  // call this the same way). findById() only exposes raw ObjectIds; the populate is what turns
  // those into renderable name/avatar/department.
  async listFriends(id: string): Promise<UserDocument[]> {
    const me = await this.userModel.findById(id).populate<{ friends: UserDocument[] }>({ path: 'friends', select: '-passwordHash' }).exec();
    if (!me) throw new NotFoundException('المستخدم غير موجود');
    return me.friends;
  }

  // Raw friend id strings for `userId` -- lightweight (no populate), used by PostsService to decide
  // who may see a 'friends'-scoped post. Returns [] if the user has no friends or doesn't exist.
  async getFriendIds(userId: string): Promise<string[]> {
    const me = await this.userModel.findById(userId).select('friends').lean<{ friends: Types.ObjectId[] }>().exec();
    return (me?.friends ?? []).map((f) => f.toString());
  }

  // Own pending requests only (received + sent), populated the same way -- unlike listFriends,
  // deliberately not exposed for an arbitrary id: who's pending is not public information.
  async listFriendRequests(userId: string): Promise<{ received: UserDocument[]; sent: UserDocument[] }> {
    const me = await this.userModel
      .findById(userId)
      .populate<{ friendRequestsReceived: UserDocument[] }>({ path: 'friendRequestsReceived', select: '-passwordHash' })
      .populate<{ friendRequestsSent: UserDocument[] }>({ path: 'friendRequestsSent', select: '-passwordHash' })
      .exec();
    if (!me) throw new NotFoundException('المستخدم غير موجود');
    return { received: me.friendRequestsReceived, sent: me.friendRequestsSent };
  }

  // "People you may know" -- excludes self, existing friends, pending requests either direction,
  // and anyone blocked either direction. Prefers same department (most relevant in a college app),
  // then fills any remaining slots from the rest of the eligible pool.
  async suggestFriends(userId: string, limit = 8): Promise<UserDocument[]> {
    const me = await this.userModel.findById(userId).exec();
    if (!me) throw new NotFoundException('المستخدم غير موجود');

    const excludeIds = [
      new Types.ObjectId(userId),
      ...me.friends,
      ...me.friendRequestsSent,
      ...me.friendRequestsReceived,
      ...me.blockedUsers,
    ];
    const baseFilter = {
      _id: { $nin: excludeIds },
      blockedUsers: { $ne: new Types.ObjectId(userId) },
      isActive: true,
    };

    const bySameDepartment = me.department
      ? await this.userModel.find({ ...baseFilter, department: me.department }).select('-passwordHash').limit(limit).exec()
      : [];
    if (bySameDepartment.length >= limit) return bySameDepartment;

    const alreadyPicked = excludeIds.concat(bySameDepartment.map((u) => u._id as Types.ObjectId));
    const rest = await this.userModel
      .find({ ...baseFilter, _id: { $nin: alreadyPicked } })
      .select('-passwordHash')
      .limit(limit - bySameDepartment.length)
      .exec();
    return [...bySameDepartment, ...rest];
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
      // The first account is also the sole super admin -- only it can manage user accounts until it
      // grants the flag to another admin (see AdminService.updateSuperAdmin).
      isSuperAdmin: isFirstUser,
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

  async updateSuperAdmin(id: string, isSuperAdmin: boolean): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(id, { isSuperAdmin }, { new: true })
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

  // Called fire-and-forget from ChatGateway on socket connect/disconnect -- uses updateOne (no
  // document fetched back) since the result is never read, keeping connection churn cheap.
  async setOnline(id: string, isOnline: boolean, lastSeenAt?: Date): Promise<void> {
    await this.userModel
      .updateOne({ _id: id }, { isOnline, ...(lastSeenAt ? { lastSeenAt } : {}) })
      .exec();
  }

  // "Your classmates online right now" -- other users in the caller's شعبة with a live socket
  // (isOnline is maintained by ChatGateway; SocketProvider connects app-wide, so it means "app
  // open"). Falls back to college-wide for a caller with no شعبة set. Excludes the caller.
  async onlineInDepartment(
    userId: string,
    department: string | null,
    limit = 24,
  ): Promise<Pick<UserDocument, '_id' | 'name' | 'photoUrl' | 'role'>[]> {
    const filter: Record<string, unknown> = {
      isOnline: true,
      _id: { $ne: new Types.ObjectId(userId) },
    };
    if (department) filter.department = department;
    return this.userModel
      .find(filter)
      .select('name photoUrl role')
      .sort({ lastSeenAt: -1 })
      .limit(Math.min(Math.max(limit, 1), 60))
      .exec();
  }

  async countAdmins(): Promise<number> {
    return this.userModel.countDocuments({ role: Role.ADMIN }).exec();
  }

  async countSuperAdmins(): Promise<number> {
    return this.userModel.countDocuments({ isSuperAdmin: true }).exec();
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

  // Signups over the trailing `days` window + period-over-period totals for the admin console.
  async getSignupTrend(days: number): Promise<TrendSeries> {
    const [series, current, previous] = await Promise.all([
      this.dailySignups(days),
      this.userModel.countDocuments({ createdAt: { $gte: daysAgoStart(days) } }).exec(),
      this.userModel.countDocuments({ createdAt: previousWindowMatch(days) }).exec(),
    ]);
    return { series, current, previous };
  }
}
