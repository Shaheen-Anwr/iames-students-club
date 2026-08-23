import { IsEmail, IsString } from 'class-validator';

export class SetPersonalEmailDto {
  @IsString()
  currentPassword: string;

  @IsEmail({}, { message: 'البريد الشخصي غير صالح' })
  personalEmail: string;
}
