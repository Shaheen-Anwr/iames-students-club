import { IsEmail, IsString, Length, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsEmail({}, { message: 'البريد الشخصي غير صالح' })
  personalEmail: string;

  @IsString()
  @Length(6, 6, { message: 'رمز التحقق يجب أن يتكون من 6 أرقام' })
  code: string;

  @IsString()
  @MinLength(6, { message: 'يجب ألا تقل كلمة المرور الجديدة عن 6 أحرف' })
  newPassword: string;
}
