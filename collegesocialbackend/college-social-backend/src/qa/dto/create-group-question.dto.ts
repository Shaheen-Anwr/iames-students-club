import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateGroupQuestionDto {
  @IsString()
  @IsNotEmpty({ message: 'عنوان السؤال مطلوب' })
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty({ message: 'نص السؤال مطلوب' })
  body: string;

  @IsOptional()
  @IsString()
  courseCode?: string;
}
