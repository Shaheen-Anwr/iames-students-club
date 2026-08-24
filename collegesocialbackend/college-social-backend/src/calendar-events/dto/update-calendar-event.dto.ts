import { IsIn, IsISO8601, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateCalendarEventDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'العنوان مطلوب' })
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'التاريخ غير صالح' })
  date?: string;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/, { message: 'الوقت يجب أن يكون بصيغة HH:mm' })
  time?: string;

  @IsOptional()
  @IsIn(['event', 'reminder'], { message: 'النوع يجب أن يكون حدث أو تذكير' })
  kind?: 'event' | 'reminder';
}
