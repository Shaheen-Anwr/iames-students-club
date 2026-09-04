import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { LISTING_CATEGORIES, LISTING_STATUSES } from '../schemas/listing.schema';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateListingDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'العنوان مطلوب' })
  @MaxLength(140)
  title: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(1500)
  description?: string;

  @IsInt()
  @Min(0)
  price: number;

  @IsIn(LISTING_CATEGORIES as unknown as string[])
  category: (typeof LISTING_CATEGORIES)[number];

  // URLs from POST /api/upload/post-images.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  images?: string[];
}

export class UpdateListingDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(140)
  title?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(1500)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsIn(LISTING_CATEGORIES as unknown as string[])
  category?: (typeof LISTING_CATEGORIES)[number];

  @IsOptional()
  @IsIn(LISTING_STATUSES as unknown as string[])
  status?: (typeof LISTING_STATUSES)[number];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  images?: string[];
}
