import { IsString, Matches } from 'class-validator';

export class VerifyEmailDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'رمز التحقق يجب أن يتكون من 6 أرقام' })
  code: string;
}
