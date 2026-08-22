import { IsISO8601, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePlannerTaskDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'عنوان المهمة مطلوب' })
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsString()
  courseCode?: string;
}
