import { IsString, MinLength } from 'class-validator';

export class AdminSetPasswordDto {
  @IsString()
  @MinLength(6, { message: 'يجب ألا تقل كلمة المرور عن 6 أحرف' })
  password: string;
}
