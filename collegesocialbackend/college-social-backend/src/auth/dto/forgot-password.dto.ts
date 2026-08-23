import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'البريد الشخصي غير صالح' })
  personalEmail: string;
}
