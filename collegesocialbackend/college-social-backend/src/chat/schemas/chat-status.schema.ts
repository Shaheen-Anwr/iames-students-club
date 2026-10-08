import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ChatStatusDocument = HydratedDocument<ChatStatus>;

// One person who opened the story (once each), and the quick reaction they left on it, if any.
// Only the author ever gets this list (ChatStatusService.viewers); everyone else just sees whether
// *they* watched it.
@Schema({ _id: false })
export class StatusView {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  @Prop({ type: Date, required: true })
  at: Date;

  @Prop({ type: String, default: null })
  reaction: string | null;
}

export const StatusViewSchema = SchemaFactory.createForClass(StatusView);

@Schema({ timestamps: true })
export class ChatStatus {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  author: Types.ObjectId;

  @Prop({ default: '', maxlength: 600 })
  text: string;

  @Prop({ type: String, default: null })
  imageUrl: string | null;

  // Video stories: a Cloudflare Stream HLS manifest ('stream') or a Cloudinary MP4 ('cloudinary'),
  // the Stream uid (to delete it), a poster frame and the server-verified length in seconds.
  @Prop({ type: String, default: null })
  videoUrl: string | null;

  @Prop({ type: String, enum: ['cloudinary', 'stream'], default: null })
  videoProvider: 'cloudinary' | 'stream' | null;

  @Prop({ type: String, default: null })
  videoUid: string | null;

  @Prop({ type: String, default: null })
  posterUrl: string | null;

  @Prop({ type: Number, default: null })
  durationSec: number | null;

  @Prop({ type: [StatusViewSchema], default: [] })
  views: StatusView[];

  @Prop({ required: true })
  expiresAt: Date;
}

export const ChatStatusSchema = SchemaFactory.createForClass(ChatStatus);
ChatStatusSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
ChatStatusSchema.index({ author: 1, expiresAt: -1 });
