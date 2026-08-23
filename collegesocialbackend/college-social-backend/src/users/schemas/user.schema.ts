import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Role } from '../../common/enums/role.enum';
import { Department } from '../../common/enums/department.enum';
import { AcademicYear } from '../../common/enums/academic-year.enum';
import { Specialization } from '../../common/enums/specialization.enum';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  // The college's own student/professor ID, e.g. "2430525". Used to log in.
  @Prop({ required: true, unique: true, trim: true, index: true })
  collegeId: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ required: true, trim: true })
  name: string;

  // The only email on the account. Required, unique, must be verified. `sparse` tolerates the
  // handful of pre-existing accounts grandfathered in without one during the auth overhaul migration.
  @Prop({ required: true, unique: true, index: true, sparse: true, lowercase: true, trim: true })
  collegeEmail: string;

  @Prop({ type: Date, default: null })
  collegeEmailVerifiedAt: Date | null;

  // Single active email-verification token at a time; overwritten on resend.
  @Prop({ type: String, default: null })
  emailVerificationTokenHash: string | null;

  @Prop({ type: Date, default: null })
  emailVerificationExpiresAt: Date | null;

  // Cloudinary URL. Null until the user uploads one.
  @Prop({ type: String, required: false, default: null })
  photoUrl: string | null;

  // Profile banner image, shown behind the avatar on ProfileHeader. Null until uploaded.
  @Prop({ type: String, required: false, default: null })
  coverPhotoUrl: string | null;

  @Prop({ type: String, required: true, enum: Role, default: Role.STUDENT })
  role: Role;

  @Prop({ default: true })
  isActive: boolean;

  // Self-editable "About" info -- any user can set these on their own profile.
  @Prop({ type: String, default: null, trim: true })
  bio: string | null;

  // One of the three fixed departments. Was a free-text field before this feature landed --
  // see runStartupMigrations() in main.ts for the one-time cleanup of pre-existing values that
  // don't match the enum.
  @Prop({ type: String, enum: Department, default: null })
  department: Department | null;

  // Was free-text before this feature landed -- see runStartupMigrations() in main.ts for the
  // one-time cleanup of pre-existing values that don't match the enum.
  @Prop({ type: String, enum: AcademicYear, default: null })
  academicYear: AcademicYear | null;

  // Self-editable, like department/academicYear above. Snapshotted onto every post the user
  // creates (see PostsService.create()) so the feed can be filtered by it.
  @Prop({ type: String, enum: Specialization, default: null })
  specialization: Specialization | null;

  // Gamification -- see src/gamification/.
  @Prop({ default: 0 })
  points: number;

  @Prop({ default: 0 })
  streakCount: number;

  @Prop({ type: Date, default: null })
  lastActiveDate: Date | null;

  // Badge IDs from a fixed, code-defined catalog (see gamification/badges.ts) -- not
  // DB-managed content, so no separate collection/schema for badges themselves.
  @Prop({ type: [String], default: [] })
  badges: string[];

  // Chat presence -- kept on the user doc (not a separate collection) since it's a single
  // small mutable field set, updated on every socket connect/disconnect (see ChatGateway).
  @Prop({ default: false })
  isOnline: boolean;

  @Prop({ type: Date, default: null })
  lastSeenAt: Date | null;
}

export const UserSchema = SchemaFactory.createForClass(User);
