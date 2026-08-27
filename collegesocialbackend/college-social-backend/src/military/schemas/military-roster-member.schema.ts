import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MilitaryRosterMemberDocument = HydratedDocument<MilitaryRosterMember>;

// One name from the التربية العسكرية unit roster the admin uploads (a CSV or PDF listing the
// students in the unit). The whole collection is replaced wholesale on each upload, mirroring
// MilitaryScheduleItem. `matchedUser` is filled in when the name resolves to exactly one
// registered account; names that match nobody (or match ambiguously) stay unmatched and are
// surfaced back to the admin.
@Schema({ timestamps: true })
export class MilitaryRosterMember {
  // The name exactly as it appeared in the uploaded file.
  @Prop({ required: true, trim: true })
  rawName: string;

  // Normalized form used for matching + dedup (see normalizeName in MilitaryService).
  @Prop({ required: true })
  normalizedName: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  matchedUser: Types.ObjectId | null;

  // Audit only -- the admin who uploaded the roster this row came from.
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  uploadedBy: Types.ObjectId;
}

export const MilitaryRosterMemberSchema = SchemaFactory.createForClass(MilitaryRosterMember);
MilitaryRosterMemberSchema.index({ normalizedName: 1 }, { unique: true });
