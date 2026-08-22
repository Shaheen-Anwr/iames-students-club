import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { QuestionScope } from '../schemas/question.schema';

export class AskQuestionDto {
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

  // Defaults applied in QaService.askQuestion() based on the author's department if omitted.
  @IsOptional()
  @IsEnum(QuestionScope)
  scope?: QuestionScope;
}
