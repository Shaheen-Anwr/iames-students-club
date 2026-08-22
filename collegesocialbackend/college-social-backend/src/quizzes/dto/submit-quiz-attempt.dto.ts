import { ArrayMinSize, IsArray, IsInt } from 'class-validator';

export class SubmitQuizAttemptDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'يجب الإجابة على سؤال واحد على الأقل' })
  @IsInt({ each: true, message: 'إجابات غير صالحة' })
  answers: number[];
}
