import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class CreateQuizQuestionDto {
  @IsString()
  @IsNotEmpty({ message: 'نص السؤال مطلوب' })
  text: string;

  @IsArray()
  @ArrayMinSize(2, { message: 'يجب إضافة خيارين على الأقل' })
  @IsString({ each: true })
  options: string[];

  @IsInt({ message: 'يجب تحديد الإجابة الصحيحة' })
  @Min(0)
  correctIndex: number;
}

export class CreateQuizDto {
  @IsString()
  @IsNotEmpty({ message: 'عنوان الاختبار مطلوب' })
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  courseCode?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'يجب إضافة سؤال واحد على الأقل' })
  @ValidateNested({ each: true })
  @Type(() => CreateQuizQuestionDto)
  questions: CreateQuizQuestionDto[];
}
