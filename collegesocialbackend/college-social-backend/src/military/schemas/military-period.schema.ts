import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MilitaryPeriodDocument = HydratedDocument<MilitaryPeriod>;

// Singleton config for the التربية العسكرية (military education) camp -- there is only ever one
// document in this collection. MilitaryService reads/writes it via findOne()/upsert, never by id,
// mirroring how a lightweight app-settings record would be stored.
@Schema({ timestamps: true })
export class MilitaryPeriod {
  @Prop({ type: Date, required: true })
  startDate: Date;

  @Prop({ type: Date, required: true })
  endDate: Date;

  @Prop({ required: true, trim: true, default: 'التربية العسكرية' })
  title: string;

  // Rotated one-per-day on the student view (see MilitaryService.getMyStatus()).
  @Prop({
    type: [String],
    default: [
      'الانضباط جسر بين الأهداف والإنجاز.',
      'يوم جديد، فرصة جديدة لتثبت التزامك.',
      'القوة الحقيقية في المواظبة، لا في يومٍ واحد.',
      'كل حضور اليوم خطوة نحو التخرج.',
      'الثبات على الصغائر يصنع العظائم.',
    ],
  })
  motivationalQuotes: string[];

  // Audit only -- the admin who last saved the period.
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  updatedBy: Types.ObjectId;
}

export const MilitaryPeriodSchema = SchemaFactory.createForClass(MilitaryPeriod);
