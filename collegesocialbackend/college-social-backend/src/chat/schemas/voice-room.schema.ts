import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ _id: false })
export class VoiceRoomParticipant {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  socketId: string;

  @Prop({ required: true })
  name: string;

  @Prop({ type: String, default: null })
  photoUrl: string | null;

  @Prop({ default: true })
  muted: boolean;

  @Prop({ required: true })
  lastSeen: Date;
}

@Schema({ timestamps: true })
export class VoiceRoom {
  @Prop({ type: Types.ObjectId, ref: 'Conversation', required: true, unique: true })
  conversation: Types.ObjectId;

  @Prop({ type: [SchemaFactory.createForClass(VoiceRoomParticipant)], default: [] })
  participants: VoiceRoomParticipant[];
}

export type VoiceRoomDocument = HydratedDocument<VoiceRoom>;
export const VoiceRoomSchema = SchemaFactory.createForClass(VoiceRoom);
VoiceRoomSchema.index({ 'participants.socketId': 1 });
VoiceRoomSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 86400 });
