import { IsString } from 'class-validator';

export class LoginDto {
  @IsString({ message: 'الرقم الجامعي مطلوب' })
  collegeId: string;

  @IsString({ message: 'كلمة المرور مطلوبة' })
  password: string;
}
