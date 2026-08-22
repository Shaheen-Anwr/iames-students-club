import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ChannelMessageDocument = HydratedDocument<ChannelMessage>;

@Schema({ timestamps: true })
export class ChannelMessage {
  @Prop({ type: Types.ObjectId, ref: 'Channel', required: true, index: true })
  channel: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  sender: Types.ObjectId;

  @Prop({ required: false, default: '', trim: true })
  text: string;

  @Prop({ type: String, required: false, default: null })
  attachmentUrl: string | null;
}

export const ChannelMessageSchema = SchemaFactory.createForClass(ChannelMessage);
