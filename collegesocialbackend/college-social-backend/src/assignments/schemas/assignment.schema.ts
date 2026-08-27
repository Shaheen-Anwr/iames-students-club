import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AssignmentDocument = HydratedDocument<Assignment>;

// Deliberately local to this module (not imported from posts/) to keep Assignments decoupled
// from Posts, matching how Message/Conversation don't cross-import Post's types either.
export enum AssignmentAttachmentType {
  LECTURE = 'lecture',
  VIDEO = 'video',
  FILE = 'file',
  NONE = 'none',
}

@Schema({ timestamps: true })
export class Assignment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  createdBy: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: false, trim: true, default: '' })
  description: string;

  @Prop({ required: true, trim: true, index: true })
  courseCode: string;

  @Prop({ type: Date, required: true, index: true })
  dueDate: Date;

  @Prop({ type: String, required: true, enum: AssignmentAttachmentType, default: AssignmentAttachmentType.NONE })
  attachmentType: AssignmentAttachmentType;

  @Prop({ type: String, required: false, default: null })
  attachmentUrl: string | null;

  @Prop({ type: String, required: false, default: null })
  attachmentOriginalName: string | null;

  // `ref` must sit at this outer level, not nested inside the array's object literal -- see the
  // NOTE in chat/schemas/conversation.schema.ts's `participants` prop for why.
  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  completedBy: Types.ObjectId[];

  // true for assignments students add for themselves (visible only to their creator); false/unset
  // for professor-created assignments, which stay visible to everyone as before.
  @Prop({ type: Boolean, default: false })
  isPersonal: boolean;

  // true for التربية العسكرية (military education) assignments -- admin/professor created, always
  // global (never isPersonal), surfaced in the /study/military section and filtered via
  // GET /assignments?military=true. false/unset for every other assignment.
  @Prop({ type: Boolean, default: false, index: true })
  isMilitary: boolean;

  // Set only for assignments created inside a study group (by its owner) -- null for every
  // pre-existing global/personal assignment. Visibility for these is gated by group membership
  // instead of isPersonal, see AssignmentsService.visibilityFilter().
  @Prop({ type: Types.ObjectId, ref: 'StudyGroup', default: null, index: true })
  group: Types.ObjectId | null;
}

export const AssignmentSchema = SchemaFactory.createForClass(Assignment);
AssignmentSchema.index({ group: 1, dueDate: 1 });
