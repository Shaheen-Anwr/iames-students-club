import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MilitaryTodoDocument = HydratedDocument<MilitaryTodo>;

// A student's own private التربية العسكرية checklist item -- distinct from the admin-broadcast
// military assignments (Assignment.isMilitary), which every student shares.
@Schema({ timestamps: true })
export class MilitaryTodo {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 300 })
  text: string;

  @Prop({ type: Boolean, default: false })
  done: boolean;

  // Ascending display order within the owner's list.
  @Prop({ type: Number, default: 0 })
  order: number;
}

export const MilitaryTodoSchema = SchemaFactory.createForClass(MilitaryTodo);
MilitaryTodoSchema.index({ user: 1, order: 1 });
