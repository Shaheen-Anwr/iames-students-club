import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type NotificationDocument = HydratedDocument<Notification>;

export type NotificationType =
  | 'chat_message'
  | 'channel_message'
  | 'post_comment'
  | 'post_reaction'
  | 'post_share'
  | 'comment_reply'
  | 'comment_reaction'
  | 'qa_answer'
  | 'mention'
  | 'friend_request'
  | 'friend_accept'
  // Academia Reels (see src/reels) -- like/comment/reply on a reel, or an @mention in a reel
  // caption or comment. All link to /reels/<reelId>.
  | 'reel_like'
  | 'reel_comment'
  | 'reel_comment_reply'
  | 'reel_mention'
  // Platform/department announcement fanned out by AnnouncementsService -- one per recipient.
  // `actor` is the announcement's author; `title` is the announcement headline.
  | 'system_announcement';

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  recipient: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  actor: Types.ObjectId | null;

  @Prop({
    required: true,
    enum: [
      'chat_message',
      'channel_message',
      'post_comment',
      'post_reaction',
      'post_share',
      'comment_reply',
      'comment_reaction',
      'qa_answer',
      'mention',
      'friend_request',
      'friend_accept',
      'reel_like',
      'reel_comment',
      'reel_comment_reply',
      'reel_mention',
      'system_announcement',
    ],
  })
  type: NotificationType;

  // Set for system_announcement: the announcement headline, shown under the "<author> نشر إعلانًا"
  // line (or as the headline itself for legacy rows written before the author was carried).
  @Prop({ type: String, default: null })
  title: string | null;

  // Explicit click target for notifications whose destination isn't derivable from an id above
  // (system_announcement -> the announcements page).
  @Prop({ type: String, default: null })
  link: string | null;

  @Prop({ type: String, default: null })
  conversationId: string | null;

  @Prop({ type: String, default: null })
  channelId: string | null;

  @Prop({ type: String, default: null })
  groupId: string | null;

  @Prop({ type: String, default: null })
  postId: string | null;

  // Set for reel_like / reel_comment / reel_comment_reply / reel_mention -- click target is
  // /reels/<reelId>.
  @Prop({ type: String, default: null })
  reelId: string | null;

  @Prop({ type: String, default: null })
  questionId: string | null;

  @Prop({ type: String, default: null })
  preview: string | null;

  @Prop({ default: false, index: true })
  read: boolean;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });
