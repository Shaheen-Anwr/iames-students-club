import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ChannelDocument = HydratedDocument<Channel>;

@Schema({ timestamps: true })
export class Channel {
  @Prop({ type: Types.ObjectId, ref: 'StudyGroup', required: true, index: true })
  group: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;
}

export const ChannelSchema = SchemaFactory.createForClass(Channel);
