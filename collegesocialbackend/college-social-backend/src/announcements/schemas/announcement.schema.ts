import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Department } from '../../common/enums/department.enum';

export type AnnouncementDocument = HydratedDocument<Announcement>;

@Schema({ timestamps: true })
export class Announcement {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  author: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 200 })
  title: string;

  @Prop({ required: true, trim: true })
  body: string;

  // null = platform-wide; otherwise only visible to that department, same split as Post/Question.
  @Prop({ type: String, enum: Department, default: null, index: true })
  department: Department | null;

  @Prop({ default: false, index: true })
  pinned: boolean;

  // Optional -- when set, this announcement also shows up on CalendarService's aggregated view.
  @Prop({ type: Date, default: null, index: true })
  eventDate: Date | null;

  // One-tap acknowledgement ("👍") -- lightweight engagement so students can register they've
  // seen an announcement without a comment thread. See AnnouncementsService.toggleLike.
  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  likes: Types.ObjectId[];
}

export const AnnouncementSchema = SchemaFactory.createForClass(Announcement);
AnnouncementSchema.index({ pinned: -1, createdAt: -1 });
