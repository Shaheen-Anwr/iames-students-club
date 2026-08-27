import { IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { GRADE_LETTERS, GradeLetter } from '../grade-points';

export class CreateGpaCourseDto {
  @IsString()
  @IsNotEmpty({ message: 'اسم المقرر مطلوب' })
  @MaxLength(200)
  name: string;

  @IsNumber()
  @Min(0.5, { message: 'عدد الساعات غير صالح' })
  @Max(12, { message: 'عدد الساعات غير صالح' })
  creditHours: number;

  // Absent/null -> "in progress".
  @IsOptional()
  @IsIn([...GRADE_LETTERS], { message: 'التقدير غير صالح' })
  grade?: GradeLetter | null;

  @IsString()
  @IsNotEmpty({ message: 'الفصل الدراسي مطلوب' })
  @MaxLength(120)
  term: string;

  @IsOptional()
  @IsBoolean()
  countsTowardGpa?: boolean;
}
