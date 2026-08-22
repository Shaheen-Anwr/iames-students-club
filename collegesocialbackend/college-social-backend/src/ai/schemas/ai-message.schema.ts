import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AiMessageDocument = HydratedDocument<AiMessage>;

// Which context sources (schedule / lecture chunk / feed post / feed comment) fed into an
// assistant reply -- `ref` points at the source document (LectureChunk/Post/Comment id) when
// applicable, omitted for the schedule block which isn't its own document. Embedded, same as
// Reaction on Post -- see post.schema.ts.
@Schema({ _id: false })
export class AiMessageSource {
  @Prop({ required: true })
  label: string;

  @Prop({ required: false })
  ref?: string;
}

export const AiMessageSourceSchema = SchemaFactory.createForClass(AiMessageSource);

@Schema({ timestamps: true })
export class AiMessage {
  @Prop({ type: Types.ObjectId, ref: 'AiConversation', required: true, index: true })
  conversation: Types.ObjectId;

  @Prop({ required: true, enum: ['user', 'assistant'] })
  role: 'user' | 'assistant';

  @Prop({ required: true })
  text: string;

  // Only ever populated on 'assistant' messages -- see AiConversationsService.sendMessage().
  @Prop({ type: [AiMessageSourceSchema], default: [] })
  sources: AiMessageSource[];

  // Human-readable audit trail of platform actions the assistant actually took while answering
  // this turn (e.g. "✓ أضاف مهمة: ..."), populated only via tool calls -- see AiToolsService.
  // Only ever populated on 'assistant' messages, same as `sources`.
  @Prop({ type: [String], default: [] })
  actions: string[];

  // Set on a 'user' message when the student attached a file/image -- see SendAiMessageDto.
  @Prop({ required: false })
  attachmentUrl?: string;

  @Prop({ required: false, enum: ['image', 'document'] })
  attachmentType?: 'image' | 'document';

  // Set on a 'user' message when the student shared an existing feed post into the chat -- see
  // SendAiMessageDto.sharedPostId. Kept as a plain id (not populated) since there's no post-detail
  // route to link to yet; the frontend just shows a small "post attached" chip.
  @Prop({ type: String, required: false })
  sharedPostId?: string;
}

export const AiMessageSchema = SchemaFactory.createForClass(AiMessage);
