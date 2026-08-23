import { IsNotEmpty, IsString } from 'class-validator';

export class UnsubscribeDto {
  @IsString()
  @IsNotEmpty({ message: 'بيانات الاشتراك غير صالحة' })
  endpoint: string;
}
