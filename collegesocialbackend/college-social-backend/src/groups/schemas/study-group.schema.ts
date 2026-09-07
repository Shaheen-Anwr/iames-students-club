import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Department } from '../../common/enums/department.enum';

export type StudyGroupDocument = HydratedDocument<StudyGroup>;

export type GroupVisibility = 'public' | 'private';

@Schema({ timestamps: true })
export class StudyGroup {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, required: false, default: null, trim: true })
  description: string | null;

  // Cloudinary (or local) URL of the group's avatar image. Null = fall back to the initial-letter tile.
  @Prop({ type: String, required: false, default: null })
  photoUrl: string | null;

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

  // Snapshotted from the owner's شعبة at creation time. The group explorer (`GET /groups/all`)
  // and public discovery are STRICT-walled to the viewer's own شعبة -- a student never sees
  // another شعبة's groups in a listing. `null` = created by staff with no شعبة. Opening a group
  // by direct link / invite code is NOT walled (see GroupsService.findOne / joinByCode).
  @Prop({ type: String, required: false, enum: Department, default: null, index: true })
  department: Department | null;
}

export const StudyGroupSchema = SchemaFactory.createForClass(StudyGroup);
