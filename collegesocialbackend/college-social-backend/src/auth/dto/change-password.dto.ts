import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(6, { message: 'يجب ألا تقل كلمة المرور الجديدة عن 6 أحرف' })
  newPassword: string;
}
