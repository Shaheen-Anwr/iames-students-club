import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Department } from '../../common/enums/department.enum';

export type ListingDocument = HydratedDocument<Listing>;

export const LISTING_CATEGORIES = ['books', 'electronics', 'notes', 'supplies', 'other'] as const;
export type ListingCategory = (typeof LISTING_CATEGORIES)[number];

export const LISTING_STATUSES = ['available', 'reserved', 'sold'] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

// One student-to-student marketplace listing (textbooks, calculators, lecture notes, lab
// supplies…). شعبة-scoped like everything else: null = whole college, else that department.
@Schema({ timestamps: true })
export class Listing {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  seller: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ default: '', trim: true })
  description: string;

  // In the college's local currency, whole units. 0 = free / مجاني.
  @Prop({ type: Number, required: true, min: 0 })
  price: number;

  @Prop({ type: String, enum: LISTING_CATEGORIES, default: 'other', index: true })
  category: ListingCategory;

  @Prop({ type: String, enum: LISTING_STATUSES, default: 'available', index: true })
  status: ListingStatus;

  @Prop({ type: String, enum: Department, default: null, index: true })
  department: Department | null;

  // Cloudinary URLs from POST /api/upload/post-images, same as a feed image post.
  @Prop({ type: [String], default: [] })
  images: string[];
}

export const ListingSchema = SchemaFactory.createForClass(Listing);
ListingSchema.index({ department: 1, status: 1, createdAt: -1 });
ListingSchema.index({ title: 'text', description: 'text' });
