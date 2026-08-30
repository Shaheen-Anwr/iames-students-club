import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateEventDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'العنوان مطلوب' })
  @MaxLength(160)
  title: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  organizer?: string;

  @IsDateString()
  startsAt: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;
}
