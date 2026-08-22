import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type StudyGroupDocument = HydratedDocument<StudyGroup>;

export type GroupVisibility = 'public' | 'private';

@Schema({ timestamps: true })
export class StudyGroup {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, required: false, default: null, trim: true })
  description: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  owner: Types.ObjectId;

  // Includes the owner. `ref` stays at this outer level -- see the note in
  // chat/schemas/conversation.schema.ts for why the nested-object-array form silently breaks populate.
  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  members: Types.ObjectId[];

  // 'private' groups aren't listable and are joinable only by presenting `inviteCode`.
  // 'public' groups are listable via GET /groups/discover and joinable directly, no code.
  @Prop({ type: String, enum: ['public', 'private'], default: 'private', index: true })
  visibility: GroupVisibility;

  // Only set for private groups. `sparse` so multiple `null`s (every public group) don't
  // collide on the unique index.
  @Prop({ type: String, default: null, unique: true, sparse: true })
  inviteCode: string | null;
}

export const StudyGroupSchema = SchemaFactory.createForClass(StudyGroup);
